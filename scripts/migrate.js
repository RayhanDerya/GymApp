import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const envFilePath = path.join(repoRoot, '.env');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(envFilePath);

  const databaseUrl = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('YOUR_DATABASE_URL')) {
    console.error('DATABASE_URL is missing. Set it in .env or pass it in the environment.');
    console.error('Example: DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require');
    process.exit(1);
  }

  if (!existsSync(migrationsDir)) {
    console.error(`Migrations folder not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log('No SQL migration files found.');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const alreadyApplied = await client.query(
        'select 1 from schema_migrations where name = $1 limit 1',
        [file],
      );
      if (alreadyApplied.rowCount > 0) {
        console.log(`Skipping already applied migration: ${file}`);
        continue;
      }

      const sql = await readFile(filePath, 'utf8');
      console.log(`Applying migration: ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
    console.log('Migrations completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:');
  console.error(error);
  process.exit(1);
});
