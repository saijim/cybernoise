import * as dotenv from "dotenv";
import { existsSync, writeFileSync } from "fs";
import pLimit from "p-limit";
import Replicate from "replicate";
import { ImageProvider } from "./image-providers";
import { getTopicsWithPapers } from "./storeArticlesInDB";

dotenv.config();

// Configuration (Replicate only)
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";

const limit = pLimit(1);

interface Paper {
  id: string;
  prompt?: string;
}

/**
 * Generate an image for a paper using the Replicate provider.
 * @param paper The paper object containing id and prompt
 */
async function generateImage(paper: Paper, provider: ImageProvider) {
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
  let finalProviderName = "N/A";

  try {
    const providerName = `Replicate (Model: ${REPLICATE_MODEL})`;
    console.log(`Generating via ${providerName} for ${paper.id}`);
    imageBuffer = await provider.generate(enhancedPrompt, paper.id);
    if (imageBuffer) finalProviderName = providerName;

    if (imageBuffer) {
      writeFileSync(imagePath, imageBuffer);
      console.log(`Saved image for ${paper.id} via ${finalProviderName}`);
    } else {
      console.error(`Failed to generate image for ${paper.id} using Replicate (model: ${REPLICATE_MODEL})`);
    }
  } catch (error) {
    console.error(`Unexpected error generating image for ${paper.id}:`, error);
  }
}

async function main() {
  console.log("### Generating images...");

  // Get papers from database instead of JSON file
  const topics = await getTopicsWithPapers();
  const papers = topics.flatMap((topic: { papers: Paper[] }) => topic.papers);

  console.log(`Found ${papers.length} papers, ${papers.filter((p: Paper) => p.prompt).length} with prompts`);

  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("REPLICATE_API_TOKEN not set. Cannot generate images with Replicate.");
    return;
  }

  const replicateClient = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const provider = new ImageProvider(replicateClient, REPLICATE_MODEL);
  console.log(`Using image provider: replicate (model: ${REPLICATE_MODEL})`);

  const results = await Promise.all(
    papers
      .filter((p: Paper) => p.prompt)
      .map((paper: Paper) =>
        limit(() =>
          generateImage(paper, provider).catch((err) => {
            console.error(`Outer catch: Failed to process image generation task for ${paper.id}:`, err);
            return null; // Ensure Promise.all continues
          })
        )
      )
  );

  console.log(`Image generation complete. Processed ${results.length} papers.`);
}

main();
