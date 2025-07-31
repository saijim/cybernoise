import * as dotenv from "dotenv";
import { existsSync, writeFileSync } from "fs";
import pLimit from "p-limit";
import Replicate from "replicate"; // Used to instantiate the Replicate client for the provider
import { type ImageProvider, LocalImageProvider, ReplicateImageProvider } from "./image-providers";
import { getTopicsWithPapers } from "./storeArticlesInDB";

dotenv.config();

// Configure image generation provider (set to 'local' or 'replicate')
const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || "local";
// Configure Replicate model to use (defaults to black-forest-labs/flux-schnell)
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";
console.log(
  `Using image provider: ${IMAGE_PROVIDER}${IMAGE_PROVIDER === "replicate" ? ` with model: ${REPLICATE_MODEL}` : ""}`
);

// Fallback mechanism: If FALLBACK_TO_LOCAL is set to 'true', the system will
// attempt to use the local Stable Diffusion API if Replicate fails
const FALLBACK_ENABLED = process.env.FALLBACK_TO_LOCAL === "true";

// Initialize image providers
let primaryProvider: ImageProvider;
let fallbackProvider: ImageProvider | null = null;

const localStableDiffusionProvider = new LocalImageProvider();

if (IMAGE_PROVIDER === "replicate") {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.warn("Warning: REPLICATE_API_TOKEN not set. Using local provider as primary.");
    primaryProvider = localStableDiffusionProvider;
  } else {
    const replicateClient = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
    primaryProvider = new ReplicateImageProvider(replicateClient, REPLICATE_MODEL);
    if (FALLBACK_ENABLED) {
      fallbackProvider = localStableDiffusionProvider;
      console.log("Fallback to local Stable Diffusion provider is enabled.");
    }
  }
} else {
  // Default to local provider if IMAGE_PROVIDER is 'local' or not 'replicate'
  primaryProvider = localStableDiffusionProvider;
  if (IMAGE_PROVIDER !== "local") {
    console.log(`IMAGE_PROVIDER set to '${IMAGE_PROVIDER}', defaulting to local provider.`);
  }
}

// Log effective provider setup
if (primaryProvider instanceof ReplicateImageProvider) {
  console.log(`Effective primary provider: Replicate (Model: ${REPLICATE_MODEL})`);
  if (fallbackProvider) {
    console.log(`Effective fallback provider: Local Stable Diffusion`);
  }
} else if (primaryProvider instanceof LocalImageProvider) {
  console.log(`Effective primary provider: Local Stable Diffusion`);
}

const limit = pLimit(1);

interface Paper {
  id: string;
  prompt?: string;
  slug: string;
}

/**
 * Generate an image for a paper using the configured image provider.
 * It will attempt the primary provider, then the fallback provider if configured and primary fails.
 * @param paper The paper object containing id and prompt
 */
async function generateImage(paper: Paper) {
  if (!paper.prompt) {
    console.log(`Skipping ${paper.id}: No prompt available`);
    return;
  }

  const imagePath = `./src/images/articles/${paper.id}.png`;
  if (existsSync(imagePath)) {
    console.log(`Skipping ${paper.id}: Image already exists at ${imagePath}`);
    return;
  }

  console.log(
    `Generating image for ${paper.id}: "${paper.prompt.substring(0, 50)}${paper.prompt.length > 50 ? "..." : ""}"`
  );

  const enhancedPrompt = `(Vapor wave),${paper.prompt}`;
  let imageBuffer: Buffer | null = null;
  let finalProviderName: string = "N/A"; // Name of the provider that successfully generated the image

  try {
    // Attempt with primary provider
    const primaryProviderName =
      primaryProvider instanceof ReplicateImageProvider
        ? `Replicate (Model: ${REPLICATE_MODEL})`
        : "Local Stable Diffusion";

    console.log(`Attempting image generation for ${paper.id} using primary provider: ${primaryProviderName}`);
    imageBuffer = await primaryProvider.generate(enhancedPrompt, paper.id);

    if (imageBuffer) {
      finalProviderName = primaryProviderName;
    } else if (fallbackProvider) {
      // If primary fails and fallback is available
      const fallbackProviderName = "Local Stable Diffusion (Fallback)"; // Current setup implies fallback is always Local SD
      console.log(
        `Primary provider (${primaryProviderName}) failed for ${paper.id}. Attempting fallback to: ${fallbackProviderName}`
      );
      imageBuffer = await fallbackProvider.generate(enhancedPrompt, paper.id);
      if (imageBuffer) {
        finalProviderName = fallbackProviderName;
      }
    }

    if (imageBuffer) {
      writeFileSync(imagePath, imageBuffer);
      console.log(`Successfully generated and saved image for ${paper.id} using ${finalProviderName}`);
    } else {
      // Log failure after all attempts
      let attemptedProvidersMessage = primaryProviderName;
      if (fallbackProvider) {
        attemptedProvidersMessage += " and Local Stable Diffusion (Fallback)";
      }
      console.error(`Failed to generate image for ${paper.id} after all attempts with: ${attemptedProvidersMessage}.`);
    }
  } catch (error) {
    // This catch is for unexpected errors during the orchestration in this function,
    // not for errors from the providers themselves (they should return null).
    console.error(`Unexpected error during image generation process for ${paper.id}:`, error);
  }
}

async function main() {
  console.log("### Generating images...");

  // Get papers from database instead of JSON file
  const topics = await getTopicsWithPapers();
  const papers = topics.flatMap((topic: { papers: Paper[] }) => topic.papers);

  console.log(`Found ${papers.length} papers, ${papers.filter((p: Paper) => p.prompt).length} with prompts`);

  const results = await Promise.all(
    papers
      .filter((p: Paper) => p.prompt)
      .map((paper: Paper) =>
        limit(() =>
          generateImage(paper).catch((err) => {
            // This catch handles unexpected errors from generateImage or the limit wrapper itself.
            // generateImage is designed to handle its internal errors and log them.
            console.error(`Outer catch: Failed to process image generation task for ${paper.id}:`, err);
            return null; // Ensure Promise.all continues
          })
        )
      )
  );

  console.log(`Image generation complete. Processed ${results.length} papers.`);
}

main();
