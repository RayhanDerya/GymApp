import { neon } from '@neondatabase/serverless';

// Vite only exposes env vars prefixed with VITE_.
// For a browser app, keep this as a non-production placeholder or move DB access to a backend/serverless API.
const DATABASE_URL = import.meta.env.VITE_DATABASE_URL || 'postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require';

const sql = neon(DATABASE_URL);

export default sql;
