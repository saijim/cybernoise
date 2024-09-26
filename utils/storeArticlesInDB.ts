import { open } from "sqlite";
import sqlite3 from "sqlite3";

interface Paper {
  id: string;
  slug: string;
  title: string;
  link: string;
  abstract: string;
  creator: string;
}

interface Feed {
  feed: Paper[];
  [key: string]: unknown;
}

export default async function storeArticlesInDB(rssFeeds: Feed[]) {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  await db.exec(
    "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, slug TEXT, title TEXT, link TEXT, abstract TEXT, creator TEXT)"
  );

  try {
    await db.run("BEGIN TRANSACTION");
    for (const feed of rssFeeds) {
      for (const paper of feed.feed) {
        const insert = await db.prepare(`INSERT OR IGNORE INTO articles VALUES (?, ?, ?, ?, ?, ?)`);
        await insert.run(paper.id, paper.slug, paper.title, paper.link, paper.abstract, paper.creator);
        insert.finalize();
      }
    }
    await db.run("COMMIT");
  } catch (err: unknown) {
    await db.run("ROLLBACK");
    console.error("Error storing articles:", err);
  }
}
