import { dbExecute, dbQueryAll, dbQueryOne, dbTransaction } from "../src/lib/db";

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

// DB configuration and client are centralized in src/lib/db

export async function initializeDatabase() {
  // Create tables if they don't exist
  await dbExecute(
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

  await dbExecute(
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
  const tx = await dbTransaction("write");
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
  const tx = await dbTransaction("write");
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
  const rows = await dbQueryAll<any>(`
    SELECT 
      r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic,
      g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
    FROM raw_papers r
    INNER JOIN generated_articles g ON r.id = g.id
    ORDER BY r.topic, r.id
  `);

  const topicMap = new Map<string, any>();
  const parseKeywords = (kw: unknown): string[] => {
    if (!kw) return [];
    if (Array.isArray(kw)) return kw.map((k) => String(k));
    if (typeof kw === "string") {
      const s = kw.trim();
      if (!s) return [];
      try {
        if (s.startsWith("[")) return JSON.parse(s);
      } catch {}
      // Fallback: comma-separated or single word
      return s
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(String(kw));
      return Array.isArray(parsed) ? parsed.map((k) => String(k)) : [];
    } catch {
      return [];
    }
  };
  for (const row of rows as any[]) {
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
      keywords: parseKeywords((row as any).keywords),
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
  const row: any = await dbQueryOne(
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
    const parseKeywords = (kw: unknown): string[] => {
      if (!kw) return [];
      if (Array.isArray(kw)) return kw.map((k) => String(k));
      if (typeof kw === "string") {
        const s = kw.trim();
        if (!s) return [];
        try {
          if (s.startsWith("[")) return JSON.parse(s);
        } catch {}
        return s
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }
      try {
        const parsed = JSON.parse(String(kw));
        return Array.isArray(parsed) ? parsed.map((k) => String(k)) : [];
      } catch {
        return [];
      }
    };
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
      keywords: parseKeywords(row.keywords),
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
  return dbQueryAll(`
    SELECT id, slug, title, link, abstract, creator, topic FROM raw_papers
  `);
}

export async function checkPaperExists(id: string): Promise<boolean> {
  const row = await dbQueryOne<{ id: string }>(`SELECT id FROM generated_articles WHERE id = ?`, [id]);
  return !!row;
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
    await dbExecute(`UPDATE raw_papers SET full_text = ? WHERE id = ?`, [fullText, id]);
    console.log(`Stored full text for paper: ${id}`);
  } catch (err: unknown) {
    console.error("Error storing full text:", err);
  }
}

export async function getFullText(id: string): Promise<string | null> {
  const row: any = await dbQueryOne(`SELECT full_text FROM raw_papers WHERE id = ?`, [id]);
  return row?.full_text || null;
}

// New functions for working with separate tables

export async function getRawPaperById(id: string): Promise<RawPaper | null> {
  const row = await dbQueryOne<RawPaper>(`SELECT * FROM raw_papers WHERE id = ?`, [id]);
  return row || null;
}

export async function getGeneratedArticleById(id: string): Promise<GeneratedArticle | null> {
  const row: any = await dbQueryOne(`SELECT * FROM generated_articles WHERE id = ?`, [id]);
  if (row) {
    const parseKeywords = (kw: unknown): string[] => {
      if (!kw) return [];
      if (Array.isArray(kw)) return kw.map((k) => String(k));
      if (typeof kw === "string") {
        const s = kw.trim();
        if (!s) return [];
        try {
          if (s.startsWith("[")) return JSON.parse(s);
        } catch {}
        return s
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }
      try {
        const parsed = JSON.parse(String(kw));
        return Array.isArray(parsed) ? parsed.map((k) => String(k)) : [];
      } catch {
        return [];
      }
    };
    return {
      ...row,
      keywords: parseKeywords(row.keywords),
    } as GeneratedArticle;
  }
  return null;
}

export async function getAllRawPapers(): Promise<RawPaper[]> {
  return dbQueryAll<RawPaper>(`SELECT * FROM raw_papers ORDER BY topic, id`);
}

export async function getAllGeneratedArticles(): Promise<GeneratedArticle[]> {
  const rows = await dbQueryAll<any>(`SELECT * FROM generated_articles ORDER BY topic, id`);
  const parseKeywords = (kw: unknown): string[] => {
    if (!kw) return [];
    if (Array.isArray(kw)) return kw.map((k) => String(k));
    if (typeof kw === "string") {
      const s = kw.trim();
      if (!s) return [];
      try {
        if (s.startsWith("[")) return JSON.parse(s);
      } catch {}
      return s
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(String(kw));
      return Array.isArray(parsed) ? parsed.map((k) => String(k)) : [];
    } catch {
      return [];
    }
  };
  return rows.map((row: any) => ({
    ...row,
    keywords: parseKeywords(row.keywords),
  }));
}

export async function getRawPapersWithoutGeneratedArticles(): Promise<RawPaper[]> {
  return dbQueryAll<RawPaper>(`
    SELECT r.* FROM raw_papers r
    LEFT JOIN generated_articles g ON r.id = g.id
    WHERE g.id IS NULL
    ORDER BY r.topic, r.id
  `);
}

// Legacy export for backward compatibility
export default storeRawPapers;

// Housekeeping: keep only the latest N entries per topic
export async function pruneRawPapers(keep: number = 9): Promise<void> {
  // Delete dependent generated_articles first, then raw_papers, in a transaction
  const tx = await dbTransaction("write");
  try {
    await tx.execute({
      sql: `
        WITH ranked AS (
          SELECT id, topic, ROW_NUMBER() OVER (PARTITION BY topic ORDER BY id DESC) AS rn
          FROM raw_papers
        )
        DELETE FROM generated_articles
        WHERE id IN (
          SELECT id FROM ranked WHERE rn > ?
        )
      `,
      args: [keep],
    });

    await tx.execute({
      sql: `
        WITH ranked AS (
          SELECT id, topic, ROW_NUMBER() OVER (PARTITION BY topic ORDER BY id DESC) AS rn
          FROM raw_papers
        )
        DELETE FROM raw_papers
        WHERE (id, topic) IN (
          SELECT id, topic FROM ranked WHERE rn > ?
        )
      `,
      args: [keep],
    });

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function pruneGeneratedArticles(keep: number = 9): Promise<void> {
  await dbExecute(
    `
      WITH ranked AS (
        SELECT id, topic, ROW_NUMBER() OVER (PARTITION BY topic ORDER BY id DESC) AS rn
        FROM generated_articles
      )
      DELETE FROM generated_articles
      WHERE (id, topic) IN (
        SELECT id, topic FROM ranked WHERE rn > ?
      )
    `,
    [keep]
  );
}

// Utility: list all generated article IDs
export async function listGeneratedArticleIds(): Promise<string[]> {
  const rows = await dbQueryAll<{ id: string }>(`SELECT id FROM generated_articles`);
  return rows.map((r) => r.id);
}
