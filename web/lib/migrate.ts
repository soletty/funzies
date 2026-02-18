import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

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
