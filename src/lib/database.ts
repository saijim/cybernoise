import { createClient } from "@libsql/client";
import { join } from "path";
import { dbQueryAll } from "./db";

// This interface reflects the actual schema of the joined tables.
interface DatabaseRow {
  id: string;
  slug: string;
  title: string;
  link: string;
  abstract: string;
  creator: string;
  summary: string;
  intro: string;
  text: string;
  keywords: string;
  prompt: string;
  topic: string;
  full_text: string | null;
  raw_slug: string;
  raw_title: string;
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
const LOCAL_DB_URL = `file:${DB_PATH}`;
const DB_URL = process.env.TURSO_DATABASE_URL || LOCAL_DB_URL;
const AUTH = process.env.TURSO_AUTH_TOKEN;

// Single shared client for SSR reads
const client = createClient({ url: DB_URL, authToken: AUTH });

function createSlug(title?: string | null): string {
  if (!title) return "";
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
  // Use the generated article's slug and title, not the raw paper's
  const slug = row.slug || createSlug(row.title);
  return {
    id: row.id,
    slug,
    title: row.title, // This is now the generated title from generated_articles
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
  return (await dbQueryAll(query, params)) as unknown as T;
}

export async function getAllTopics(): Promise<Topic[]> {
  const rows = await executeQuery<DatabaseRow[]>(
    `SELECT 
      r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic, r.full_text,
      g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
    FROM raw_papers r
    INNER JOIN generated_articles g ON r.id = g.id
    ORDER BY r.id DESC`
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
    `SELECT 
      r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic, r.full_text,
      g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
    FROM raw_papers r
    INNER JOIN generated_articles g ON r.id = g.id
    WHERE r.topic = ?
    ORDER BY r.id DESC`,
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
    `SELECT 
      r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic, r.full_text,
      g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
    FROM raw_papers r
    INNER JOIN generated_articles g ON r.id = g.id
    WHERE r.id = ?`,
    [id]
  );

  if (rows.length === 0) return null;
  return transformRow(rows[0]);
}

export async function getAllPapers(): Promise<Paper[]> {
  const rows = await executeQuery<DatabaseRow[]>(
    `SELECT 
      r.id, r.slug as raw_slug, r.title as raw_title, r.link, r.abstract, r.creator, r.topic, r.full_text,
      g.title, g.slug, g.summary, g.intro, g.text, g.keywords, g.prompt
    FROM raw_papers r
    INNER JOIN generated_articles g ON r.id = g.id
    ORDER BY r.id DESC`
  );
  return rows.map(transformRow);
}
