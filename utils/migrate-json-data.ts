import { readFileSync, readdirSync } from "fs";
import path from "path";
import { storeRewrittenPaper } from "./storeArticlesInDB";

async function migrateJsonData() {
  console.log("### Migrating JSON data to database...");

  const papersPath = "./src/data/papers/";

  try {
    const files = readdirSync(papersPath).filter((file) => path.extname(file) === ".json");
    console.log(`Found ${files.length} JSON files to migrate`);

    let migrated = 0;
    for (const file of files) {
      try {
        const filePath = path.join(papersPath, file);
        const paperData = JSON.parse(readFileSync(filePath, "utf8"));

        await storeRewrittenPaper(paperData);
        migrated++;

        if (migrated % 10 === 0) {
          console.log(`Migrated ${migrated}/${files.length} papers...`);
        }
      } catch (error) {
        console.error(`Error migrating ${file}:`, error);
      }
    }

    console.log(`Successfully migrated ${migrated} papers to database`);
  } catch (error) {
    console.error("Error during JSON data migration:", error);
  }
}

migrateJsonData().catch(console.error);
