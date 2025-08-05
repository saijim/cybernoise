import { open } from "sqlite";
import sqlite3 from "sqlite3";

interface RawPaper {
  id: string;
  slug: string;
  title: string;
  link: string;
  abstract: string;
  creator: string;
  topic: string;
}

interface GeneratedArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  intro: string;
  text: string;
  keywords: string[] | string;
  prompt: string;
  topic: string;
}

interface RewrittenPaper {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  intro?: string;
  text?: string;
  keywords?: string[] | string;
  prompt?: string;
  topic?: string;
}

interface Feed {
  name: string;
  feed: {
    id: string;
    slug: string;
    title: string;
    link: string;
    abstract: string;
    creator: string;
  }[];
  [key: string]: unknown;
}

export async function initializeDatabase() {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  // Create raw_papers table for original paper data
  await db.exec(`
    CREATE TABLE IF NOT EXISTS raw_papers (
      id TEXT PRIMARY KEY,
      slug TEXT,
      title TEXT,
      link TEXT,
      abstract TEXT,
      creator TEXT,
      topic TEXT,
      full_text TEXT
    )
  `);

  // Create generated_articles table for AI-generated content
  await db.exec(`
    CREATE TABLE IF NOT EXISTS generated_articles (
      id TEXT PRIMARY KEY,
      title TEXT,
      slug TEXT,
      summary TEXT,
      intro TEXT,
      text TEXT,
      keywords TEXT,
      prompt TEXT,
      topic TEXT,
      FOREIGN KEY (id) REFERENCES raw_papers (id)
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
      const topicSlug = getTopicSlugFromName(feed.name);
      for (const paper of feed.feed) {
        // Store in raw_papers table
        const insert = await db.prepare(`
          INSERT OR IGNORE INTO raw_papers (id, slug, title, link, abstract, creator, topic) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        await insert.run(paper.id, paper.slug, paper.title, paper.link, paper.abstract, paper.creator, topicSlug);
        await insert.finalize();
      }
    }
    await db.run("COMMIT");
  } catch (err: unknown) {
    await db.run("ROLLBACK");
    console.error("Error storing raw papers:", err);
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

    // Store in generated_articles table
    await db.run(
      `
      INSERT OR REPLACE INTO generated_articles 
      (id, title, slug, summary, intro, text, keywords, prompt, topic) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        paper.id,
        paper.title,
        paper.slug,
        paper.summary,
        paper.intro,
        paper.text,
        keywordsString,
        paper.prompt,
        paper.topic,
      ]
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
    // Join raw_papers and generated_articles tables
    const rows = await db.all(`
      SELECT 
        r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic,
        g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
      FROM raw_papers r
      INNER JOIN generated_articles g ON r.id = g.id
      ORDER BY r.topic, r.id
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
        id: row.id,
        slug: row.slug,
        title: row.title,
        link: row.link,
        abstract: row.abstract,
        creator: row.creator,
        summary: row.summary,
        intro: row.intro,
        text: row.text,
        keywords: row.keywords ? JSON.parse(row.keywords) : [],
        prompt: row.prompt,
        topic: row.topic,
        raw_title: row.raw_title,
        raw_slug: row.raw_slug,
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
    // Join raw_papers and generated_articles tables
    const row = await db.get(
      `
      SELECT 
        r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic, r.full_text,
        g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
      FROM raw_papers r
      INNER JOIN generated_articles g ON r.id = g.id
      WHERE r.id = ?
    `,
      [id]
    );

    if (row) {
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        link: row.link,
        abstract: row.abstract,
        creator: row.creator,
        summary: row.summary,
        intro: row.intro,
        text: row.text,
        keywords: row.keywords ? JSON.parse(row.keywords) : [],
        prompt: row.prompt,
        topic: row.topic,
        full_text: row.full_text,
        raw_title: row.raw_title,
        raw_slug: row.raw_slug,
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
      SELECT id, slug, title, link, abstract, creator, topic FROM raw_papers
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
      SELECT id FROM generated_articles WHERE id = ?
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

function getTopicSlugFromName(name: string): string {
  const topicMap: Record<string, string> = {
    "Artificial Intelligence": "artificial-intelligence",
    "Plant Biology": "plant-biology",
    Economics: "economics",
  };
  return (
    topicMap[name] ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

export async function storeFullText(id: string, fullText: string) {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    // Store in raw_papers table
    await db.run(
      `
      UPDATE raw_papers SET full_text = ? WHERE id = ?
    `,
      [fullText, id]
    );
    console.log(`Stored full text for paper: ${id}`);
  } catch (err: unknown) {
    console.error("Error storing full text:", err);
  } finally {
    await db.close();
  }
}

export async function getFullText(id: string): Promise<string | null> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const row = await db.get(
      `
      SELECT full_text FROM raw_papers WHERE id = ?
    `,
      [id]
    );
    return row?.full_text || null;
  } finally {
    await db.close();
  }
}

// New functions for working with separate tables

export async function getRawPaperById(id: string): Promise<RawPaper | null> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const row = await db.get(
      `
      SELECT * FROM raw_papers WHERE id = ?
    `,
      [id]
    );
    return row || null;
  } finally {
    await db.close();
  }
}

export async function getGeneratedArticleById(id: string): Promise<GeneratedArticle | null> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const row = await db.get(
      `
      SELECT * FROM generated_articles WHERE id = ?
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

export async function getAllRawPapers(): Promise<RawPaper[]> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const rows = await db.all(`
      SELECT * FROM raw_papers ORDER BY topic, id
    `);
    return rows;
  } finally {
    await db.close();
  }
}

export async function getAllGeneratedArticles(): Promise<GeneratedArticle[]> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const rows = await db.all(`
      SELECT * FROM generated_articles ORDER BY topic, id
    `);
    return rows.map((row: any) => ({
      ...row,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
    }));
  } finally {
    await db.close();
  }
}

export async function getRawPapersWithoutGeneratedArticles(): Promise<RawPaper[]> {
  const db = await open({
    filename: "./papers.sqlite",
    driver: sqlite3.Database,
  });

  try {
    const rows = await db.all(`
      SELECT r.* FROM raw_papers r
      LEFT JOIN generated_articles g ON r.id = g.id
      WHERE g.id IS NULL
      ORDER BY r.topic, r.id
    `);
    return rows;
  } finally {
    await db.close();
  }
}

// Legacy export for backward compatibility
export default storeRawPapers;
