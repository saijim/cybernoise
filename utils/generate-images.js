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
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                sampler_name: "DPM++ SDE Karras",
                prompt: "<lora:Realistic000003_1_2.5DAnime_0.05_Merge1:1>, Vapor wave, ultra detailed, " + paper.prompt,
                negative_prompt:
                  "cartoon, painting, illustration, (worst quality, low quality, normal quality:1.5), (monochrome:1.3), (oversaturated:1.3), bad hands, lowres, long body, ((blurry)), duplicate, ((duplicate body parts)), (disfigured), (poorly drawn), (extra limbs), fused fingers, extra fingers, (twisted), malformed hands, ((((mutated hands and fingers)))), contorted, conjoined, ((missing limbs)), logo, signature, text, words, low res, boring, mutated, artifacts, bad art, gross, ugly, poor quality, (deformed, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation, (deformed, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation",
                steps: 8,
                cfg_scale: 2,
                width: 1024,
                height: 768,
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
