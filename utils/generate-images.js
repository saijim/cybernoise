import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";

dotenv.config();

const papers = JSON.parse(readFileSync("./src/data/papers.json", "utf8"))
  .map((topic) => topic.papers)
  .flat();

function main() {
  console.log("### Generating images...");

  const images = papers
    .filter((p) => !!p.prompt)
    .filter((p) => {
      if (existsSync(`./src/images/articles/${p.slug}.png`)) {
        console.log("Skipping", p.slug);
        return false;
      }
      return true;
    })
    .map((paper) => {
      console.log("Grepping", paper.prompt);

      return {
        prompt:
          paper.prompt +
          " digital art, cyberpunk, pastel colors. --v 5 --q 2 --ar 4:3",
        slug: paper.slug,
      };
    });

  writeFileSync(
    "./src/images/articles/prompts.txt",
    images.map((image) => `${image.slug}.png\n${image.prompt}\n`).join("\n")
  );
}

main();
