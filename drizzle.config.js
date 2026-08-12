require('dotenv').config();

/** @type { import("drizzle-kit").Config } */
module.exports = {
  schema: "./pg_schema/index.js",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.NEON_DATABASE_URL,
  }
};