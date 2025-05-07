import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import pLimit from "p-limit";
import Replicate from "replicate";

dotenv.config();

// Configure image generation provider (set to 'local' or 'replicate')
const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || "local";
// Configure Replicate model to use (defaults to black-forest-labs/flux-schnell)
const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";
console.log(
  `Using image provider: ${IMAGE_PROVIDER}${
    IMAGE_PROVIDER === "replicate" ? ` with model: ${REPLICATE_MODEL}` : ""
  }`
);

// Initialize Replicate client if needed
const replicate =
  IMAGE_PROVIDER === "replicate"
    ? new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      })
    : null;

// Verify Replicate API token if using Replicate
if (IMAGE_PROVIDER === "replicate" && !process.env.REPLICATE_API_TOKEN) {
  console.warn(
    "Warning: REPLICATE_API_TOKEN not set. Falling back to local provider."
  );
}

// Fallback mechanism: If FALLBACK_TO_LOCAL is set to 'true', the system will
// attempt to use the local Stable Diffusion API if Replicate fails
const FALLBACK_ENABLED = process.env.FALLBACK_TO_LOCAL === "true";

const limit = pLimit(1);

interface Paper {
  id: string;
  prompt?: string;
  slug: string;
}

const papers = JSON.parse(
  readFileSync("./src/data/papers.json", "utf8")
).flatMap((topic: { papers: Paper[] }) => topic.papers);

/**
 * Generate an image for a paper using either local Stable Diffusion or Replicate
 * @param paper The paper object containing id and prompt
 * @param useLocalFallback If true, forces using the local SD API (used for fallback)
 */
async function generateImage(paper: Paper, useLocalFallback = false) {
  if (!paper.prompt) {
    console.log(`Skipping ${paper.id}: No prompt available`);
    return;
  }

  if (existsSync(`./src/images/articles/${paper.id}.png`)) {
    console.log(`Skipping ${paper.id}: Image already exists`);
    return;
  }

  console.log(
    `Generating image for ${paper.id}: "${paper.prompt.substring(0, 50)}${
      paper.prompt.length > 50 ? "..." : ""
    }"`
  );

  try {
    if (IMAGE_PROVIDER === "local" || useLocalFallback) {
      // Use local Stable Diffusion API
      console.log(`Connecting to local Stable Diffusion API for ${paper.id}`);
      try {
        const response = await fetch("http://127.0.0.1:7860/sdapi/v1/txt2img", {
          method: "POST",
          body: JSON.stringify({
            sampler_name: "Euler",
            scheduler: "Beta",
            prompt: `(Vapor wave),${paper.prompt}`,
            steps: 30,
            cfg_scale: 5,
            width: 1280,
            height: 768,
            model: "STOIQONewrealityFLUXSD_F1DAlpha",
          }),
          timeout: 60000, // 60 second timeout
        });

        if (!response.ok) {
          console.error(
            `Error with local SD API for ${paper.id}: ${response.status} ${response.statusText}`
          );
          return;
        }

        const { images } = (await response.json()) as { images: string[] };
        if (!images?.[0]) {
          console.error(`No image returned from local SD API for ${paper.id}`);
          return;
        }

        //@ts-ignore
        writeFileSync(
          `./src/images/articles/${paper.id}.png`,
          Buffer.from(images[0], "base64")
        );
        console.log(
          `Successfully saved image for ${paper.id} using local SD API`
        );
      } catch (localError) {
        console.error(`Error using local SD API for ${paper.id}:`, localError);
        if (useLocalFallback) return; // If already using fallback, don't try again
      }
    } else if (IMAGE_PROVIDER === "replicate") {
      // Use Replicate API
      console.log(`Using Replicate API for image generation (${paper.id})`);
      const enhancedPrompt = `(Vapor wave),${paper.prompt}`;

      const output = await replicate!.run(REPLICATE_MODEL, {
        input: {
          prompt: enhancedPrompt,
          width: 1280,
          height: 768,
          aspect_ratio: "16:9",
          safety_filter_level: "block_only_high",
        },
      });

      if (!output) {
        console.error("No image returned from Replicate");
        return;
      }

      // Handle FileOutput object from Replicate
      let imageUrl: string | undefined;
      if (typeof output === "object" && output !== null) {
        if ("url" in output && typeof output.url === "function") {
          // It's a FileOutput object
          try {
            imageUrl = await output.url();
            console.log(`Extracted URL from FileOutput: ${imageUrl}`);
          } catch (error) {
            console.error(
              `Failed to get URL from FileOutput for ${paper.id}:`,
              error
            );

            // Try to read it as a Buffer/Blob
            try {
              if ("blob" in output && typeof output.blob === "function") {
                const blob = await output.blob();
                const buffer = Buffer.from(await blob.arrayBuffer());
                writeFileSync(`./src/images/articles/${paper.id}.png`, buffer);
                console.log(
                  `Successfully saved image for ${paper.id} using blob data from Replicate`
                );
                return;
              }
            } catch (blobError) {
              console.error(
                `Failed to get blob data for ${paper.id}:`,
                blobError
              );
            }

            if (FALLBACK_ENABLED) {
              console.log(
                `Attempting to fall back to local SD API for ${paper.id}`
              );
              return generateImage(paper, true);
            }
            return;
          }
        } else if (Array.isArray(output) && output.length > 0) {
          // It's an array
          const firstItem = output[0];
          if (typeof firstItem === "string") {
            imageUrl = firstItem;
          } else if (
            typeof firstItem === "object" &&
            firstItem !== null &&
            "url" in firstItem
          ) {
            // Handle case where it's an array of objects with url property
            imageUrl =
              typeof firstItem.url === "function"
                ? await firstItem.url()
                : firstItem.url;
          }
        } else {
          // It's some other object, try to stringify and look for URL patterns
          const outputStr = JSON.stringify(output);
          const urlMatch = outputStr.match(
            /"(https?:\/\/[^"]+\.(png|jpg|jpeg|webp))"/i
          );
          if (urlMatch && urlMatch[1]) {
            imageUrl = urlMatch[1];
            console.log(`Extracted URL from JSON string: ${imageUrl}`);
          } else {
            console.error(
              `Unexpected Replicate output format for ${paper.id}:`,
              output
            );
            if (FALLBACK_ENABLED) {
              console.log(
                `Attempting to fall back to local SD API for ${paper.id}`
              );
              return generateImage(paper, true);
            }
            return;
          }
        }
      } else if (typeof output === "string") {
        // It's already a string URL
        imageUrl = output;
      } else {
        console.error(
          `Invalid output type from Replicate for ${paper.id}:`,
          output
        );
        if (FALLBACK_ENABLED) {
          console.log(
            `Attempting to fall back to local SD API for ${paper.id}`
          );
          return generateImage(paper, true);
        }
        return;
      }

      if (!imageUrl) {
        console.error(`Could not extract image URL for ${paper.id}`);
        if (FALLBACK_ENABLED) {
          console.log(
            `Attempting to fall back to local SD API for ${paper.id}`
          );
          return generateImage(paper, true);
        }
        return;
      }

      // Download the image from the URL provided by Replicate
      console.log(`Downloading image from Replicate URL for ${paper.id}`);
      const imageResponse = await fetch(imageUrl, {
        headers: {
          Accept: "image/png,image/jpeg,image/*",
        },
        timeout: 30000, // 30 second timeout
      });

      if (!imageResponse.ok) {
        console.error(
          `Error downloading image for ${paper.id}: ${imageResponse.status} ${imageResponse.statusText}`
        );
        return;
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(imageBuffer);

      // Verify that we have actual image data
      if (buffer.length < 1000) {
        console.error(
          `Suspiciously small image data (${buffer.length} bytes) for ${paper.id}`
        );
        if (FALLBACK_ENABLED) {
          console.log(
            `Attempting to fall back to local SD API for ${paper.id}`
          );
          return generateImage(paper, true);
        }
        return;
      }

      writeFileSync(`./src/images/articles/${paper.id}.png`, buffer);
      console.log(`Successfully saved image for ${paper.id} using Replicate`);
    } else {
      console.error(`Unknown image provider: ${IMAGE_PROVIDER}`);
      if (FALLBACK_ENABLED) {
        console.log(`Attempting to fall back to local SD API for ${paper.id}`);
        return generateImage(paper, true);
      }
    }
  } catch (err) {
    console.error(`Unexpected error generating image for ${paper.id}:`, err);
    if (
      IMAGE_PROVIDER === "replicate" &&
      FALLBACK_ENABLED &&
      !useLocalFallback
    ) {
      console.log(`Attempting to fall back to local SD API for ${paper.id}`);
      return generateImage(paper, true);
    }
  }
}

async function main() {
  console.log("### Generating images...");
  console.log(
    `Found ${papers.length} papers, ${
      papers.filter((p: Paper) => p.prompt).length
    } with prompts`
  );

  const results = await Promise.all(
    papers
      .filter((p: Paper) => p.prompt)
      .map((paper: Paper) =>
        limit(() =>
          generateImage(paper, false).catch((err) => {
            console.error(`Failed to generate image for ${paper.id}:`, err);
            return null;
          })
        )
      )
  );

  console.log(`Image generation complete. Processed ${results.length} papers.`);
}

main();
