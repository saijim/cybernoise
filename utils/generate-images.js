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
            "luosiallen/latent-consistency-model:553803fd018b3cf875a8bc774c99da9b33f36647badfd88a6eec90d61c5f62fc",
            {
              input: {
                prompt: `${paper.prompt}, futuristic, sci-fi, high res, 8k`,
                width: 1024,
                height: 768,
                negative_prompt:
                  "photographic, realistic, realism, 35mm film, dslr, cropped, frame, text, deformed, glitch, noise, noisy, off-center, deformed, cross-eyed, closed eyes, bad anatomy, ugly, disfigured, sloppy, duplicate, mutated, black and white",
                num_inference_steps: 8,
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
