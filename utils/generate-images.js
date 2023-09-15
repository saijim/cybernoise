import * as dotenv from "dotenv";
import { createWriteStream, existsSync, readFileSync } from "fs";
import Replicate from "replicate";
import https from "https";

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
            "stability-ai/sdxl:8beff3369e81422112d93b89ca01426147de542cd4684c244b673b105188fe5f",
            {
              input: {
                prompt: `best quality, ${paper.prompt}, blade runner, cyberpunk, vaporwave, sci-fi, neon, high res, painted by Simon Stålenhag`,
                width: 1536,
                height: 1024,
                scheduler: "KarrasDPM",
                negative_prompt:
                  "photographic, realistic, realism, 35mm film, dslr, cropped, frame, text, deformed, glitch, noise, noisy, off-center, deformed, cross-eyed, closed eyes, bad anatomy, ugly, disfigured, sloppy, duplicate, mutated, black and white",
                refiner: "expert_ensemble_refiner",
                num_inference_steps: 35,
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
