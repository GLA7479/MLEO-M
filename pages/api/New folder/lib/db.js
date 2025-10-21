// lib/db.js
import { Pool } from "pg";

// Initialize pool with error handling
let pool;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
  });

  console.log("Database pool initialized successfully");
} catch (error) {
  console.error("Failed to initialize database pool:", error.message);
  pool = null;
}

export async function q(sql, params = []) {
  if (!pool) {
    throw new Error("Database pool not initialized. Check DATABASE_URL environment variable.");
  }

  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}
