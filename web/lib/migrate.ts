import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");

  try {
    await pool.query(schema);
    console.log("Migration completed successfully.");
  } finally {
    await pool.end();
  }
}

migrate();
