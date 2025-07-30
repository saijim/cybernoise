import Replicate from "replicate";
import { Buffer } from "buffer";

export interface ImageProvider {
  generate(prompt: string, paperId: string): Promise<Buffer | null>;
}

class BaseProvider {
  protected async fetchBuffer(url: string, options?: RequestInit): Promise<Buffer | null> {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000) as any,
      });

      if (!response.ok) {
        console.error(`[Fetch] HTTP ${response.status}: ${response.statusText}`);
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) {
        console.error(`[Fetch] Suspiciously small image data (${buffer.length} bytes)`);
        return null;
      }
      return buffer;
    } catch (error) {
      console.error(`[Fetch] Network error:`, error);
      return null;
    }
  }

  protected log(message: string): void {
    console.log(`[${this.constructor.name}] ${message}`);
  }

  protected logError(message: string, error?: any): void {
    console.error(`[${this.constructor.name}] ${message}`, error || "");
  }
}

export class LocalImageProvider extends BaseProvider implements ImageProvider {
  async generate(prompt: string, paperId: string): Promise<Buffer | null> {
    this.log(`Connecting to local Stable Diffusion API for ${paperId}`);
    
    try {
      const response = await fetch("http://127.0.0.1:7860/sdapi/v1/txt2img", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampler_name: "Euler",
          scheduler: "Beta",
          prompt,
          steps: 30,
          cfg_scale: 5,
          width: 1280,
          height: 768,
          model: "STOIQONewrealityFLUXSD_F1DAlpha",
        }),
        signal: AbortSignal.timeout(60000) as any,
      });

      if (!response.ok) {
        this.logError(`API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const { images } = (await response.json()) as { images: string[] };
      if (!images?.[0]) {
        this.logError("No image returned from API");
        return null;
      }

      return Buffer.from(images[0], "base64");
    } catch (error) {
      this.logError(`API error:`, error);
      return null;
    }
  }
}

export class ReplicateImageProvider extends BaseProvider implements ImageProvider {
  constructor(
    private replicate: Replicate,
    private model: string
  ) {
    super();
  }

  async generate(prompt: string, paperId: string): Promise<Buffer | null> {
    this.log(`Using Replicate API for image generation (${paperId})`);
    
    try {
      const output = await this.replicate.run(this.model, {
        input: {
          prompt,
          width: 1280,
          height: 768,
          aspect_ratio: "16:9",
          safety_filter_level: "block_only_high",
        },
      });

      if (!output) {
        this.logError(`No image data returned from Replicate`);
        return null;
      }

      const imageUrl = this.extractImageUrl(output);
      if (!imageUrl) {
        this.logError(`Could not extract image URL from output:`, output);
        return null;
      }

      this.log(`Downloading image from URL: ${imageUrl}`);
      return await this.fetchBuffer(imageUrl, {
        headers: { Accept: "image/png,image/jpeg,image/*" },
      });
    } catch (err) {
      this.logError(`Unexpected error:`, err);
      return null;
    }
  }

  private extractImageUrl(output: any): string | null {
    // Direct string URL
    if (typeof output === "string") return output;

    // Array with URL
    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      if (typeof first === "string") return first;
      if (first?.url) return this.resolveUrl(first);
    }

    // Object with URL
    if (output?.url) return this.resolveUrl(output);

    // JSON string URL extraction
    const urlMatch = JSON.stringify(output).match(/"(https?:\/\/[^"]+\.(png|jpg|jpeg|webp))"/i);
    return urlMatch?.[1] || null;
  }

  private async resolveUrl(obj: any): Promise<string | null> {
    if (typeof obj.url === "function") {
      try {
        return await obj.url();
      } catch {
        if (obj.blob) {
          try {
            const blob = await obj.blob();
            return URL.createObjectURL(blob);
          } catch {
            return null;
          }
        }
      }
    }
    return obj.url;
  }
}