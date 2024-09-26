import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import pLimit from "p-limit";

dotenv.config();

const limit = pLimit(1);

type Paper = { id: string; slug: string; prompt?: string };

const papers = JSON.parse(readFileSync("./src/data/papers.json", "utf8")).flatMap(
  (topic: { papers: Paper[] }) => topic.papers
);

async function generateImage(paper: { id: string; prompt?: string }) {
  if (!paper.prompt || existsSync(`./src/images/articles/${paper.id}.png`)) return;

  console.log("Generating", paper.prompt);

  try {
    const response = await fetch("http://127.0.0.1:7860/sdapi/v1/txt2img", {
      method: "POST",
      body: JSON.stringify({
        sampler_name: "Euler a",
        scheduler: "Automatic",
        prompt: `(Vapor wave),${paper.prompt},Awe-inspiring painting, dynamic scene, practical lights, centered, approaching perfection, dynamic, highly detailed, artstation, concept art, smooth, sharp focus, illustration, graffiti airbrushing techniques, high definition, accent lighting, contrasted with bright paint colors`,
        negative_prompt:
          "worst quality, low quality, low contrast, blurry, low quality, medium quality, watermark, username, signature, text, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, jpeg artifacts, bad feet, extra fingers, mutated hands, poorly drawn hands, bad proportions, extra limbs, disfigured, bad anatomy, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, mutated hands, fused fingers, too many fingers, long neck",
        steps: 10,
        cfg_scale: 2,
        width: 1280,
        height: 853,
      }),
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      return;
    }

    const { images } = (await response.json()) as { images: string[] };
    if (!images?.[0]) {
      console.error("No image returned");
      return;
    }

    //@ts-ignore
    writeFileSync(`./src/images/articles/${paper.id}.png`, Buffer.from(images[0], "base64"));
  } catch (err) {
    console.error(err);
  }
}

async function main() {
  console.log("### Generating images...");
  await Promise.all(papers.filter((p) => p.prompt).map((paper) => limit(() => generateImage(paper))));
}

main();
