import { Pool, PoolClient, QueryResultRow } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Disable parallel workers to avoid "No space left on device" shared memory errors
  // on constrained Railway instances. Queries are fast enough single-threaded.
  options: "-c max_parallel_workers_per_gather=0",
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export function getPool(): Pool {
  return pool;
}
