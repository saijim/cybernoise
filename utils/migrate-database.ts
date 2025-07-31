import { open } from "sqlite";
import sqlite3 from "sqlite3";

async function migrateDatabase() {
  console.log("### Migrating database schema...");

  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    // Check if new columns exist
    const tableInfo = await db.all("PRAGMA table_info(articles)");
    console.log(
      "Current table columns:",
      tableInfo.map((col) => col.name)
    );

    const existingColumns = tableInfo.map((col) => col.name);
    const newColumns = ["summary", "intro", "text", "keywords", "prompt", "topic"];

    // Add missing columns
    for (const column of newColumns) {
      if (!existingColumns.includes(column)) {
        console.log(`Adding column: ${column}`);
        await db.exec(`ALTER TABLE articles ADD COLUMN ${column} TEXT`);
      }
    }

    console.log("Database migration completed successfully!");
  } catch (error) {
    console.error("Error during migration:", error);
  } finally {
    await db.close();
  }
}

migrateDatabase().catch(console.error);
