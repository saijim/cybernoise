import { Buffer } from "buffer";
import Replicate from "replicate";

export class ImageProvider {
  constructor(private replicate: Replicate, private model: string) {}

  async generate(prompt: string, paperId: string): Promise<Buffer | null> {
    this.log(`Using Replicate API for image generation (${paperId})`);
    try {
      const output = await this.replicate.run(this.model as `${string}/${string}`, {
        input: {
          // Required
          prompt,
          // Model schema-aligned defaults
          aspect_ratio: "16:9",
          image_size: "optimize_for_quality",
          enhance_prompt: false,
          go_fast: true,
          guidance: 4,
          num_inference_steps: 50,
          output_format: "png", // we save images as .png in src/images/articles
          disable_safety_checker: false,
          // seed (nullable), output_quality optional and omitted unless needed
        },
      });

      if (!output) {
        this.logError("No image data returned from Replicate");
        return null;
      }

      const imageUrl = await this.extractImageUrl(output);
      if (!imageUrl) {
        this.logError("Could not extract image URL from output:", output);
        return null;
      }

      this.log(`Downloading image from URL: ${imageUrl}`);
      return await this.fetchBuffer(imageUrl, {
        headers: { Accept: "image/png,image/jpeg,image/*" },
      });
    } catch (err) {
      this.logError("Unexpected error:", err);
      return null;
    }
  }

  private async fetchBuffer(url: string, options?: RequestInit): Promise<Buffer | null> {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) as any });
      if (!response.ok) {
        this.logError(`[Fetch] HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) {
        this.logError(`[Fetch] Suspiciously small image data (${buffer.length} bytes)`);
        return null;
      }
      return buffer;
    } catch (error) {
      this.logError("[Fetch] Network error:", error);
      return null;
    }
  }

  private log(message: string): void {
    console.log(`[ImageProvider] ${message}`);
  }

  private logError(message: string, error?: any): void {
    console.error(`[ImageProvider] ${message}`, error || "");
  }

  private async extractImageUrl(output: any): Promise<string | null> {
    if (output?.url) {
      if (typeof output.url === "function") {
        try {
          return await output.url();
        } catch {
          if (output.blob && typeof output.blob === "function") {
            try {
              const blob = await output.blob();
              return URL.createObjectURL(blob);
            } catch {
              return null;
            }
          }
        }
      } else if (typeof output.url === "string") {
        return output.url;
      }
    }

    if (typeof output === "string") return output;

    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      if (typeof first === "string") return first;
      if (first?.url) return await this.extractImageUrl(first);
    }

    const urlMatch = JSON.stringify(output).match(/"(https?:\/\/[^\"]+\.(png|jpg|jpeg|webp))"/i);
    return urlMatch?.[1] || null;
  }
}
