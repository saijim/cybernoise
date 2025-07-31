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

interface RewrittenPaper extends Paper {
  summary?: string;
  intro?: string;
  text?: string;
  keywords?: string[] | string;
  prompt?: string;
  topic?: string;
}

interface Feed {
  feed: Paper[];
  [key: string]: unknown;
}

export async function initializeDatabase() {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      slug TEXT,
      title TEXT,
      link TEXT,
      abstract TEXT,
      creator TEXT,
      summary TEXT,
      intro TEXT,
      text TEXT,
      keywords TEXT,
      prompt TEXT,
      topic TEXT
    )
  `);

  await db.close();
}

export async function storeRawPapers(rssFeeds: Feed[]) {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  await initializeDatabase();

  try {
    await db.run("BEGIN TRANSACTION");
    for (const feed of rssFeeds) {
      for (const paper of feed.feed) {
        const insert = await db.prepare(`
          INSERT OR IGNORE INTO articles (id, slug, title, link, abstract, creator) 
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        await insert.run(paper.id, paper.slug, paper.title, paper.link, paper.abstract, paper.creator);
        await insert.finalize();
      }
    }
    await db.run("COMMIT");
  } catch (err: unknown) {
    await db.run("ROLLBACK");
    console.error("Error storing articles:", err);
  } finally {
    await db.close();
  }
}

export async function storeRewrittenPaper(paper: RewrittenPaper) {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const keywordsString = Array.isArray(paper.keywords) ? JSON.stringify(paper.keywords) : paper.keywords;

    await db.run(
      `
      UPDATE articles SET 
        summary = ?,
        intro = ?,
        text = ?,
        keywords = ?,
        prompt = ?,
        topic = ?
      WHERE id = ?
    `,
      [paper.summary, paper.intro, paper.text, keywordsString, paper.prompt, paper.topic, paper.id]
    );
  } catch (err: unknown) {
    console.error("Error storing rewritten paper:", err);
  } finally {
    await db.close();
  }
}

export async function getTopicsWithPapers() {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const rows = await db.all(`
      SELECT * FROM articles 
      WHERE summary IS NOT NULL 
      ORDER BY topic, id
    `);

    const topicMap = new Map();

    rows.forEach((row: any) => {
      if (!topicMap.has(row.topic)) {
        topicMap.set(row.topic, {
          name: getTopicDisplayName(row.topic),
          slug: row.topic,
          papers: [],
        });
      }

      const paper = {
        ...row,
        keywords: row.keywords ? JSON.parse(row.keywords) : [],
      };

      topicMap.get(row.topic).papers.push(paper);
    });

    return Array.from(topicMap.values());
  } finally {
    await db.close();
  }
}

export async function getPaperById(id: string) {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const row = await db.get(
      `
      SELECT * FROM articles WHERE id = ?
    `,
      [id]
    );

    if (row) {
      return {
        ...row,
        keywords: row.keywords ? JSON.parse(row.keywords) : [],
      };
    }
    return null;
  } finally {
    await db.close();
  }
}

export async function getRawPapers() {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const rows = await db.all(`
      SELECT id, slug, title, link, abstract, creator, topic FROM articles
    `);
    return rows;
  } finally {
    await db.close();
  }
}

export async function checkPaperExists(id: string): Promise<boolean> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const row = await db.get(
      `
      SELECT id FROM articles WHERE id = ? AND summary IS NOT NULL
    `,
      [id]
    );
    return !!row;
  } finally {
    await db.close();
  }
}

function getTopicDisplayName(slug: string): string {
  const topicNames: Record<string, string> = {
    "artificial-intelligence": "Artificial Intelligence",
    "plant-biology": "Plant Biology",
    economics: "Economics",
  };
  return topicNames[slug] || slug;
}

// Legacy export for backward compatibility
export default storeRawPapers;
