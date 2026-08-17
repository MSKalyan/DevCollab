// pg-mem adapter for tests: gives the app a real pg Pool interface backed by
// an in-memory PostgreSQL emulation, so `node --test` runs without a live DB.
//
// Usage: set process.env.DATABASE_URL = "pg-mem:" BEFORE importing app.js.
// models/db.js detects the scheme and returns this pool. The schema is applied
// lazily on first use so boot-time initDatabase() works unchanged.
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let memDb;
let memPool;
let schemaPromise;

async function ensureMemDb() {
  if (memPool) return memPool;

  const { newDb } = await import('pg-mem');
  memDb = newDb({ autoCreateForeignKeyIndices: true });

  const schemaSql = readFileSync(join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
  schemaPromise = memDb.public.none(schemaSql);

  // createPg returns { Client }; wire a Pool-shaped shim on top.
  const { Client } = memDb.adapters.createPg();
  const client = new Client();
  await client.connect();

  memPool = {
    query: (text, params) => client.query(text, params),
    connect: async () => {
      const c = new Client();
      await c.connect();
      return {
        query: (text, params) => c.query(text, params),
        release: () => c.end(),
      };
    },
    end: async () => client.end(),
  };

  return memPool;
}

export async function getMemPool() {
  await schemaPromise;
  return ensureMemDb();
}

export function isMemDbUrl(url) {
  return url === 'pg-mem:' || url?.startsWith('pg-mem:');
}
