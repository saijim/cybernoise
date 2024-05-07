import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import pLimit from "p-limit";

dotenv.config();

const limit = pLimit(1);
const papers = JSON.parse(readFileSync("./src/data/papers.json", "utf8"))
  .map((topic) => topic.papers)
  .flat();

async function main() {
  console.log("### Generating images...");

  await Promise.all(
    papers
      .filter((p) => !!p.prompt)
      .filter((p) => {
        if (existsSync(`./src/images/articles/${p.id}.png`)) {
          console.log("Skipping", p.slug);
          return false;
        }
        return true;
      })
      .map(async (paper) =>
        limit(async () => {
          console.log("Grepping", paper.prompt);

          try {
            const output = await fetch("http://127.0.0.1:7860/sdapi/v1/txt2img", {
              method: "POST",
              body: JSON.stringify({
                sampler_name: "Euler a",
                scheduler: "Automatic",
                prompt:
                  "(Vapor wave)," +
                  paper.prompt +
                  ", Awe-inspiring painting,  dynamic scene, practical lights, centered, approaching perfection, dynamic, highly detailed, artstation, concept art, smooth, sharp focus, illustration, graffiti airbrushing techniques, high definition, accent lighting, contrasted with bright paint colors",
                negative_prompt:
                  "worst quality, low quality, low contrast, blurry, low quality, medium quality, watermark, username, signature, text, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, jpeg artifacts, bad feet, extra fingers, mutated hands, poorly drawn hands, bad proportions, extra limbs, disfigured, bad anatomy, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, mutated hands, fused fingers, too many fingers, long neck",
                steps: 10,
                cfg_scale: 2,
                width: 1280,
                height: 853,
              }),
            });
            const image = (await output.json()).images[0];
            const decodedImageBuffer = Buffer.from(image, "base64");
            writeFileSync(`./src/images/articles/${paper.id}.png`, decodedImageBuffer);
            return true;
          } catch (err) {
            console.error(err);
            return null;
          }
        })
      )
  );
}

main();
