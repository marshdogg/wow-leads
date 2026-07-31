import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Neon connection string.",
    );
  }
  return url;
}

/**
 * Drizzle client over Neon's HTTP driver — one round trip per query, no
 * connection pooling to manage, and it works unchanged in RSC, server
 * actions, and route handlers.
 */
export const db = drizzle(neon(connectionString()), { schema });

export { schema };
export type Db = typeof db;
