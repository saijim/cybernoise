import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { env } from "node:process";
import { Configuration, OpenAIApi } from "openai";

dotenv.config();

const papers = JSON.parse(readFileSync("./src/data/papers.json", "utf8"))
  .map((topic) => topic.papers)
  .flat();

const config = new Configuration({
  apiKey: env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

const images = papers
  .slice(0, 1)
  .filter((p) => !!p.prompt)
  .filter((p) => {
    if (existsSync(`./src/images/articles/${p.slug}.png`)) {
      console.log("Skipping", p.slug);
      return false;
    }
    return true;
  })
  .map(async (paper) => {
    console.log("Grepping", paper.prompt);

    const completion = await openai.createImage({
      prompt:
        paper.prompt + " digital art. cyberpunk. pastel colors. --v 5 --q 2",
      size: "1024x1024",
      response_format: "url",
      n: 1,
    });

    try {
      return {
        image: completion.data.data[0].url,
        slug: paper.slug,
        id: paper.id,
      };
    } catch (e) {
      console.log(e);
      return null;
    }
  });

async function main() {
  console.log("### Generating images...");

  const newImages = await Promise.all(images);

  writeFileSync(
    "./src/images/articles/wget-images.sh",
    newImages
      .map(
        (image) =>
          `wget -nc -q -O ./src/images/articles/${image.slug}.png "${image.image}"`
      )
      .join("\n")
  );
}

await main();
