import * as dotenv from "dotenv";
import { createWriteStream, existsSync, readFileSync } from "fs";
import https from "https";
import Replicate from "replicate";

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const papers = JSON.parse(readFileSync("./src/data/papers.json", "utf8"))
  .map((topic) => topic.papers)
  .flat();

async function main() {
  console.log("### Generating images...");

  const images = await Promise.all(
    papers
      .filter((p) => !!p.prompt)
      .filter((p) => {
        if (existsSync(`./src/images/articles/${p.id}.png`)) {
          console.log("Skipping", p.slug);
          return false;
        }
        return true;
      })
      .map(async (paper) => {
        console.log("Grepping", paper.prompt);

        try {
          const output = await replicate.run(
            "fofr/latent-consistency-model:a83d4056c205f4f62ae2d19f73b04881db59ce8b81154d314dd34ab7babaa0f1",
            {
              input: {
                prompt: `${paper.prompt}, futuristic, sci-fi, high res, 8k`,
                width: 1024,
                height: 768,
                num_images: 1,
                guidance_scale: 8,
                archive_outputs: false,
                prompt_strength: 0.45,
                sizing_strategy: "width/height",
                lcm_origin_steps: 50,
                canny_low_threshold: 100,
                num_inference_steps: 8,
                canny_high_threshold: 200,
                control_guidance_end: 1,
                control_guidance_start: 0,
                controlnet_conditioning_scale: 2,
              },
            }
          );

          return {
            path: `./src/images/articles/${paper.id}.png`,
            uri: output[0],
          };
        } catch (err) {
          console.error(err);
          return null;
        }
      })
  );

  images
    .filter((image) => image !== null)
    .forEach((image) => {
      const file = createWriteStream(image.path);

      https
        .get(image.uri, (response) => {
          response.pipe(file);

          file.on("finish", () => {
            file.close();
            console.log("Image saved to", image.path);
          });
        })
        .on("error", (err) => {
          console.error(err);
        });
    });
}

main();
