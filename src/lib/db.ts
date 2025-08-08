import { createClient, type Client, type ResultSet, type Transaction, type TransactionMode } from "@libsql/client";
import { join } from "path";

// Resolve database URL from env or local file
const DB_PATH = join(process.cwd(), "papers.sqlite");
const LOCAL_DB_URL = `file:${DB_PATH}`;
const DB_URL = process.env.TURSO_DATABASE_URL || LOCAL_DB_URL;
const AUTH = process.env.TURSO_AUTH_TOKEN;

let client: Client | null = null;

export function getDbClient(): Client {
  if (!client) {
    client = createClient({ url: DB_URL, authToken: AUTH });
  }
  return client;
}

export async function dbExecute(sql: string, args: (string | number | bigint | null)[] = []): Promise<ResultSet> {
  const c = getDbClient();
  return c.execute({ sql, args });
}

export async function dbQueryAll<T = any>(sql: string, args: (string | number | bigint | null)[] = []): Promise<T[]> {
  const rs = await dbExecute(sql, args);
  return rs.rows as unknown as T[];
}

export async function dbQueryOne<T = any>(
  sql: string,
  args: (string | number | bigint | null)[] = []
): Promise<T | null> {
  const rs = await dbExecute(sql, args);
  const row = (rs.rows as any[])[0];
  return (row as T) ?? null;
}

export async function dbTransaction(mode: TransactionMode = "deferred"): Promise<Transaction> {
  const c = getDbClient();
  return c.transaction(mode);
}
