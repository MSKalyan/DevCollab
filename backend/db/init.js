import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../models/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initDatabase() {
  const schema = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema verified');
}
