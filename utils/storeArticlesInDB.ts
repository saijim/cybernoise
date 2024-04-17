import { open } from "sqlite";
import sqlite3 from "sqlite3";

export default async function storeArticlesInDB(rssFeeds) {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  await db.exec(
    "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, slug TEXT, title TEXT, link TEXT, abstract TEXT, creator TEXT)"
  );

  for (let i = 0; i < rssFeeds.length; i++) {
    const feed = rssFeeds[i];
    for (let j = 0; j < feed.feed.length; j++) {
      const paper = feed.feed[j];

      try {
        await db.run(`INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?)`, [
          paper.id,
          paper.slug,
          paper.title,
          paper.link,
          paper.abstract,
          paper.creator,
        ]);
      } catch (err) {
        if (err.errno !== 19) {
          console.log(err);
        }
      }
    }
  }
}
