import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { env } from "node:process";
import { Configuration, OpenAIApi } from "openai";

dotenv.config();

const papers = JSON.parse(readFileSync("./src/data/papers.json", "utf8"));

const config = new Configuration({
  apiKey: env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

const images = papers
  .filter((p) => !!p.prompt)
  .filter((p) => {
    if (existsSync(`./src/images/articles/${p.id}.jpg`)) {
      console.log("Skipping", p.id);
      return false;
    }
    return true;
  })
  .map(async (paper) => {
    console.log("Grepping", paper.title, paper.prompt);

    const completion = await openai.createImage({
      prompt:
        paper.prompt +
        " blade runner, cyberpunk, vaporwave, sci-fi, neon, high res, painted by Simon Stålenhag",
      size: "1024x1024",
      response_format: "url",
      n: 1,
    });

    try {
      return {
        image: completion.data.data[0].url,
        id: paper.id,
      };
    } catch (e) {
      console.log(e);
      return null;
    }
  });

const newImages = await Promise.all(images);

writeFileSync(
  "./src/images/articles/wget-images.sh",
  newImages
    .map((image) => `wget -O ${image.id}.png "${image.image}"`)
    .join("\n")
);
