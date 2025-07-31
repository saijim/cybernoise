import { writeFileSync } from "fs";
import { getTopicsWithPapers } from "./storeArticlesInDB";

async function main() {
  console.log("### Exporting papers from database to JSON...");

  try {
    const topics = await getTopicsWithPapers();
    writeFileSync("./src/data/papers.json", JSON.stringify(topics, null, 2));
    console.log(`Exported ${topics.length} topics to ./src/data/papers.json`);

    // Log summary
    topics.forEach((topic) => {
      console.log(`- ${topic.name}: ${topic.papers.length} papers`);
    });
  } catch (error) {
    console.error("Error exporting papers:", error);
  }
}

main().catch(console.error);
