const pool = require('./db');

async function initDB() {
  const conn = await pool.getConnection();
  try {
    console.log('⏳ Creating database tables...');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(80)  NOT NULL UNIQUE,
        email         VARCHAR(120) NOT NULL UNIQUE,
        password_hash VARCHAR(256) NOT NULL,
        role          VARCHAR(20) DEFAULT 'user',
        is_active     SMALLINT DEFAULT 1,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        topic       VARCHAR(100),
        created_by  INTEGER NOT NULL REFERENCES users(id),
        is_private  SMALLINT DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id        SERIAL PRIMARY KEY,
        group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
        role      VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (group_id, user_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id          SERIAL PRIMARY KEY,
        sender_id   INTEGER NOT NULL REFERENCES users(id),
        receiver_id INTEGER REFERENCES users(id),
        group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        content     TEXT NOT NULL,
        is_ai       SMALLINT DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS mood_entries (
        id        SERIAL PRIMARY KEY,
        user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score     SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 10),
        note      TEXT,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS video_sessions (
        id             SERIAL PRIMARY KEY,
        room_name      VARCHAR(200) NOT NULL UNIQUE,
        host_id        INTEGER NOT NULL REFERENCES users(id),
        participant_id INTEGER REFERENCES users(id),
        daily_room_url VARCHAR(300),
        started_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at       TIMESTAMP
      )
    `);

    console.log('✅ All tables created successfully.');
  } finally {
    conn.release();
  }
}

module.exports = initDB;
