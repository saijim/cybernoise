import { createClient } from "@libsql/client";

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

const LOCAL_DB_URL = "file:./papers.sqlite";
const DB_URL = process.env.TURSO_DATABASE_URL || LOCAL_DB_URL;
const AUTH = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url: DB_URL, authToken: AUTH });

export async function initializeDatabase() {
  // Create tables if they don't exist
  await client.execute(
    `CREATE TABLE IF NOT EXISTS raw_papers (
      id TEXT PRIMARY KEY,
      slug TEXT,
      title TEXT,
      link TEXT,
      abstract TEXT,
      creator TEXT,
      topic TEXT,
      full_text TEXT
    )`
  );

  await client.execute(
    `CREATE TABLE IF NOT EXISTS generated_articles (
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
    )`
  );
}

export async function storeRawPapers(rssFeeds: Feed[]) {
  await initializeDatabase();
  const tx = await client.transaction("write");
  try {
    for (const feed of rssFeeds) {
      const topicSlug = getTopicSlugFromName(feed.name);
      for (const paper of feed.feed) {
        await tx.execute({
          sql: `INSERT OR IGNORE INTO raw_papers (id, slug, title, link, abstract, creator, topic) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [paper.id, paper.slug, paper.title, paper.link, paper.abstract, paper.creator, topicSlug],
        });
      }
    }
    await tx.commit();
  } catch (err: unknown) {
    await tx.rollback();
    console.error("Error storing raw papers:", err);
  }
}

export async function storeRewrittenPaper(paper: RewrittenPaper) {
  const keywordsString = Array.isArray(paper.keywords) ? JSON.stringify(paper.keywords) : paper.keywords;
  const tx = await client.transaction("write");
  try {
    await tx.execute({
      sql: `INSERT OR REPLACE INTO generated_articles (id, title, slug, summary, intro, text, keywords, prompt, topic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        paper.id,
        paper.title,
        paper.slug,
        paper.summary ?? null,
        paper.intro ?? null,
        paper.text ?? null,
        keywordsString ?? null,
        paper.prompt ?? null,
        paper.topic ?? null,
      ],
    });
    await tx.commit();
  } catch (err: unknown) {
    await tx.rollback();
    console.error("Error storing rewritten paper:", err);
  }
}

export async function getTopicsWithPapers() {
  const rs = await client.execute(`
    SELECT 
      r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic,
      g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
    FROM raw_papers r
    INNER JOIN generated_articles g ON r.id = g.id
    ORDER BY r.topic, r.id
  `);

  const topicMap = new Map<string, any>();
  for (const row of rs.rows as any[]) {
    if (!topicMap.has((row as any).topic)) {
      topicMap.set((row as any).topic, {
        name: getTopicDisplayName((row as any).topic),
        slug: (row as any).topic,
        papers: [],
      });
    }

    const paper = {
      id: (row as any).id,
      slug: (row as any).slug,
      title: (row as any).title,
      link: (row as any).link,
      abstract: (row as any).abstract,
      creator: (row as any).creator,
      summary: (row as any).summary,
      intro: (row as any).intro,
      text: (row as any).text,
      keywords: (row as any).keywords ? JSON.parse((row as any).keywords) : [],
      prompt: (row as any).prompt,
      topic: (row as any).topic,
      raw_title: (row as any).raw_title,
      raw_slug: (row as any).raw_slug,
    };

    topicMap.get((row as any).topic).papers.push(paper);
  }

  return Array.from(topicMap.values());
}

export async function getPaperById(id: string) {
  const rs = await client.execute({
    sql: `
      SELECT 
        r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic, r.full_text,
        g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
      FROM raw_papers r
      INNER JOIN generated_articles g ON r.id = g.id
      WHERE r.id = ?
    `,
    args: [id],
  });

  const row: any = (rs.rows as any[])[0];
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
}

export async function getRawPapers() {
  const rs = await client.execute(`
    SELECT id, slug, title, link, abstract, creator, topic FROM raw_papers
  `);
  return rs.rows as any[];
}

export async function checkPaperExists(id: string): Promise<boolean> {
  const rs = await client.execute({
    sql: `SELECT id FROM generated_articles WHERE id = ?`,
    args: [id],
  });
  return (rs.rows as any[]).length > 0;
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
  try {
    await client.execute({
      sql: `UPDATE raw_papers SET full_text = ? WHERE id = ?`,
      args: [fullText, id],
    });
    console.log(`Stored full text for paper: ${id}`);
  } catch (err: unknown) {
    console.error("Error storing full text:", err);
  }
}

export async function getFullText(id: string): Promise<string | null> {
  const rs = await client.execute({
    sql: `SELECT full_text FROM raw_papers WHERE id = ?`,
    args: [id],
  });
  const row: any = (rs.rows as any[])[0];
  return row?.full_text || null;
}

// New functions for working with separate tables

export async function getRawPaperById(id: string): Promise<RawPaper | null> {
  const rs = await client.execute({
    sql: `SELECT * FROM raw_papers WHERE id = ?`,
    args: [id],
  });
  return ((rs.rows as any[])[0] as RawPaper) || null;
}

export async function getGeneratedArticleById(id: string): Promise<GeneratedArticle | null> {
  const rs = await client.execute({
    sql: `SELECT * FROM generated_articles WHERE id = ?`,
    args: [id],
  });
  const row: any = (rs.rows as any[])[0];
  if (row) {
    return {
      ...row,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
    } as GeneratedArticle;
  }
  return null;
}

export async function getAllRawPapers(): Promise<RawPaper[]> {
  const rs = await client.execute(`SELECT * FROM raw_papers ORDER BY topic, id`);
  return rs.rows as unknown as RawPaper[];
}

export async function getAllGeneratedArticles(): Promise<GeneratedArticle[]> {
  const rs = await client.execute(`SELECT * FROM generated_articles ORDER BY topic, id`);
  return (rs.rows as any[]).map((row: any) => ({
    ...row,
    keywords: row.keywords ? JSON.parse(row.keywords) : [],
  }));
}

export async function getRawPapersWithoutGeneratedArticles(): Promise<RawPaper[]> {
  const rs = await client.execute(`
    SELECT r.* FROM raw_papers r
    LEFT JOIN generated_articles g ON r.id = g.id
    WHERE g.id IS NULL
    ORDER BY r.topic, r.id
  `);
  return rs.rows as unknown as RawPaper[];
}

// Legacy export for backward compatibility
export default storeRawPapers;
