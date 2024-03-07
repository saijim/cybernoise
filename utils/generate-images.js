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
            "lucataco/sdxl-lightning-4step:727e49a643e999d602a896c774a0658ffefea21465756a6ce24b7ea4165eba6a",
            {
              input: {
                prompt: `${paper.prompt}, futuristic, sci-fi`,
                width: 1280,
                height: 1024,
                num_images: 1,
                guidance_scale: 0,
                num_inference_steps: 4,
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
