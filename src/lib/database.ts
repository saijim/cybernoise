import { join } from "path";
import Database from "sqlite3";

// This interface reflects the actual schema of the 'articles' table.
interface DatabaseRow {
  id: string;
  slug: string | null;
  title: string;
  link: string;
  abstract: string;
  creator: string;
  summary: string | null;
  intro: string | null;
  text: string | null;
  keywords: string | null;
  prompt: string | null;
  topic: string;
  full_text: string | null;
}

// This is the interface Astro components will use.
export interface Paper {
  id: string;
  slug: string;
  title: string;
  link: string;
  abstract: string;
  creator: string;
  summary: string;
  intro: string;
  text: string;
  keywords: string[];
  prompt: string;
  topic: string;
  full_text: string | null;
}

export interface Topic {
  name: string;
  slug: string;
  papers: Paper[];
}

const DB_PATH = join(process.cwd(), "papers.sqlite");

function openDatabase(): Promise<Database.Database> {
  return new Promise((resolve, reject) => {
    // Open in read-only mode as the website should not modify the database
    const db = new Database.Database(DB_PATH, Database.OPEN_READONLY, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function runQuery<T>(db: Database.Database, query: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

function closeDatabase(db: Database.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['"“”,.!?]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseKeywords(keywords: string | null): string[] {
  if (!keywords) return [];
  try {
    // Handle both JSON array and comma-separated strings
    if (keywords.startsWith("[")) {
      return JSON.parse(keywords);
    }
    return keywords.split(",").map((k) => k.trim());
  } catch {
    return [];
  }
}

function getTopicName(topicSlug: string): string {
  const topicNames: Record<string, string> = {
    "artificial-intelligence": "Artificial Intelligence",
    "plant-biology": "Plant Biology",
    economics: "Economics",
  };
  return topicNames[topicSlug] || topicSlug;
}

function transformRow(row: DatabaseRow): Paper {
  return {
    id: row.id,
    slug: row.slug || createSlug(row.title),
    title: row.title,
    link: row.link,
    abstract: row.abstract,
    creator: row.creator,
    summary: row.summary || "",
    intro: row.intro || "",
    text: row.text || "",
    keywords: parseKeywords(row.keywords),
    prompt: row.prompt || "",
    topic: row.topic,
    full_text: row.full_text,
  };
}

async function executeQuery<T>(query: string, params: any[] = []): Promise<T> {
  const db = await openDatabase();
  try {
    const results = await runQuery<DatabaseRow[]>(db, query, params);
    return results as T;
  } finally {
    await closeDatabase(db);
  }
}

export async function getAllTopics(): Promise<Topic[]> {
  const rows = await executeQuery<DatabaseRow[]>(
    `SELECT * FROM articles WHERE summary IS NOT NULL AND summary != '' ORDER BY id DESC`
  );

  const topicMap = new Map<string, Paper[]>();
  for (const row of rows) {
    const paper = transformRow(row);
    if (!topicMap.has(row.topic)) {
      topicMap.set(row.topic, []);
    }
    topicMap.get(row.topic)!.push(paper);
  }

  const topics: Topic[] = [];
  for (const [slug, papers] of topicMap) {
    topics.push({
      name: getTopicName(slug),
      slug,
      papers,
    });
  }
  return topics;
}

export async function getTopicBySlug(slug: string): Promise<Topic | null> {
  const rows = await executeQuery<DatabaseRow[]>(
    `SELECT * FROM articles WHERE topic = ? AND summary IS NOT NULL AND summary != '' ORDER BY id DESC`,
    [slug]
  );

  if (rows.length === 0) return null;
  const papers = rows.map(transformRow);
  return {
    name: getTopicName(slug),
    slug,
    papers,
  };
}

export async function getPaperById(id: string): Promise<Paper | null> {
  const rows = await executeQuery<DatabaseRow[]>(
    `SELECT * FROM articles WHERE id = ? AND summary IS NOT NULL AND summary != ''`,
    [id]
  );

  if (rows.length === 0) return null;
  return transformRow(rows[0]);
}

export async function getAllPapers(): Promise<Paper[]> {
  const rows = await executeQuery<DatabaseRow[]>(
    `SELECT * FROM articles WHERE summary IS NOT NULL AND summary != '' ORDER BY id DESC`
  );
  return rows.map(transformRow);
}
