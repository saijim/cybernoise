import Replicate from "replicate";
import { Buffer } from "buffer"; // Explicit import for clarity

export interface ImageProvider {
  generate(prompt: string, paperId: string): Promise<Buffer | null>;
}

export class LocalImageProvider implements ImageProvider {
  async generate(prompt: string, paperId: string): Promise<Buffer | null> {
    console.log(`[LocalProvider] Connecting to local Stable Diffusion API for ${paperId}`);
    try {
      const response = await fetch("http://127.0.0.1:7860/sdapi/v1/txt2img", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sampler_name: "Euler",
          scheduler: "Beta",
          prompt: prompt, // The full prompt is passed here
          steps: 30,
          cfg_scale: 5,
          width: 1280,
          height: 768,
          model: "STOIQONewrealityFLUXSD_F1DAlpha",
        }),
        // @ts-ignore AbortSignal.timeout() is relatively new
        signal: AbortSignal.timeout(60000), // 60 second timeout
      });

      if (!response.ok) {
        console.error(
          `[LocalProvider] Error with local SD API for ${paperId}: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const { images } = (await response.json()) as { images: string[] };
      if (!images?.[0]) {
        console.error(`[LocalProvider] No image returned from local SD API for ${paperId}`);
        return null;
      }

      return Buffer.from(images[0], "base64");
    } catch (localError) {
      console.error(`[LocalProvider] Error using local SD API for ${paperId}:`, localError);
      return null;
    }
  }
}

export class ReplicateImageProvider implements ImageProvider {
  private replicate: Replicate;
  private model: string;

  constructor(replicateClient: Replicate, modelIdentifier: string) {
    this.replicate = replicateClient;
    this.model = modelIdentifier;
  }

  async generate(prompt: string, paperId: string): Promise<Buffer | null> {
    console.log(`[ReplicateProvider] Using Replicate API for image generation (${paperId})`);
    try {
      const output = await this.replicate.run(this.model, {
        input: {
          prompt: prompt, // The full prompt is passed here
          width: 1280,
          height: 768,
          aspect_ratio: "16:9",
          safety_filter_level: "block_only_high",
        },
      });

      if (!output) {
        console.error(`[ReplicateProvider] No image data returned from Replicate for ${paperId}`);
        return null;
      }

      let imageUrl: string | undefined;
      let imageDataBuffer: Buffer | undefined;

      // Handle various Replicate output types
      if (typeof output === "object" && output !== null) {
        if ("url" in output && typeof (output as any).url === "function") { // FileOutput object
          try {
            imageUrl = await (output as any).url();
            console.log(`[ReplicateProvider] Extracted URL from FileOutput for ${paperId}: ${imageUrl}`);
          } catch (error) {
            console.error(
              `[ReplicateProvider] Failed to get URL from FileOutput for ${paperId}:`,
              error
            );
            // Try to read it as a Buffer/Blob if URL extraction failed
            if ("blob" in output && typeof (output as any).blob === "function") {
              try {
                const blob = await (output as any).blob();
                imageDataBuffer = Buffer.from(await blob.arrayBuffer());
                console.log(`[ReplicateProvider] Extracted blob data from FileOutput for ${paperId}`);
              } catch (blobError) {
                console.error(
                  `[ReplicateProvider] Failed to get blob data from FileOutput for ${paperId}:`,
                  blobError
                );
              }
            }
          }
        } else if (Array.isArray(output) && output.length > 0) { // Array of URLs or objects with URL
          const firstItem = output[0];
          if (typeof firstItem === "string") {
            imageUrl = firstItem;
          } else if (
            typeof firstItem === "object" &&
            firstItem !== null &&
            "url" in firstItem
          ) {
            imageUrl =
              typeof (firstItem as any).url === "function"
                ? await (firstItem as any).url()
                : (firstItem as any).url;
          }
        } else { // Other object, try to find URL in JSON string
          const outputStr = JSON.stringify(output);
          const urlMatch = outputStr.match(
            /"(https?:\/\/[^"]+\.(png|jpg|jpeg|webp))"/i
          );
          if (urlMatch && urlMatch[1]) {
            imageUrl = urlMatch[1];
            console.log(`[ReplicateProvider] Extracted URL from JSON string for ${paperId}: ${imageUrl}`);
          }
        }
      } else if (typeof output === "string") { // Direct URL string
        imageUrl = output;
      }

      if (imageDataBuffer) {
        return imageDataBuffer; // Already have buffer from blob
      }

      if (!imageUrl) {
        console.error(`[ReplicateProvider] Could not extract image URL or data from Replicate output for ${paperId}:`, output);
        return null;
      }

      // Download the image from the URL
      console.log(`[ReplicateProvider] Downloading image from Replicate URL for ${paperId}: ${imageUrl}`);
      const imageResponse = await fetch(imageUrl, {
        headers: {
          Accept: "image/png,image/jpeg,image/*",
        },
        // @ts-ignore
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!imageResponse.ok) {
        console.error(
          `[ReplicateProvider] Error downloading image for ${paperId} from ${imageUrl}: ${imageResponse.status} ${imageResponse.statusText}`
        );
        return null;
      }

      const imageArrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(imageArrayBuffer);

      if (buffer.length < 1000) { // Basic sanity check for image data
        console.error(
          `[ReplicateProvider] Suspiciously small image data (${buffer.length} bytes) for ${paperId} from ${imageUrl}`
        );
        return null;
      }
      return buffer;

    } catch (err) {
      console.error(`[ReplicateProvider] Unexpected error using Replicate API for ${paperId}:`, err);
      return null;
    }
  }
}