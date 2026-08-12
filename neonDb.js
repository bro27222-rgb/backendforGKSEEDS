const { Pool, neonConfig } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-serverless'); // Switched to neon-serverless
const schema = require('./pg_schema/index');
const ws = require('ws');

// Tell Neon to use the standard ws library for WebSockets
neonConfig.webSocketConstructor = ws;

// Create a connection pool instead of a single HTTP client
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

// Connect Drizzle to the Pool
const db = drizzle(pool, { schema });

module.exports = { db };