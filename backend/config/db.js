const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'mindbridge',
  max: 10,
});

// Translate MySQL-style queries to PostgreSQL syntax
function translateQuery(text) {
  let i = 0;
  let pgText = text.replace(/\?/g, () => `$${++i}`);
  pgText = pgText.replace(/`/g, '"');
  pgText = pgText.replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP');
  return pgText;
}

async function execute(client, text, params) {
  const isInsert = /^\s*INSERT/i.test(text);
  const finalText = isInsert && !/RETURNING/i.test(text)
    ? translateQuery(text) + ' RETURNING id'
    : translateQuery(text);

  const result = await client.query(finalText, params);

  // Mimic mysql2's result object for INSERTs so existing route code works
  if (isInsert) {
    const insertId = result.rows[0]?.id || null;
    return [{ insertId, affectedRows: result.rowCount }, result.fields];
  }
  return [result.rows, result.fields];
}

const wrapped = {
  query: (text, params) => execute(pool, text, params),
  async getConnection() {
    const client = await pool.connect();
    return {
      query: (text, params) => execute(client, text, params),
      release: () => client.release(),
    };
  },
};

module.exports = wrapped;
