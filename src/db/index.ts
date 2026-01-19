// Database connection and initialization

import Database from 'better-sqlite3';
import path from 'node:path';
import { promises as fs } from 'node:fs';

let db: Database.Database | null = null;

export interface DatabaseConfig {
  path?: string;
  verbose?: boolean;
}

export const getDatabase = (config: DatabaseConfig = {}): Database.Database => {
  if (db) return db;

  const dbPath = config.path || path.resolve('data', 'db', 'main.sqlite');

  db = new Database(dbPath, {
    verbose: config.verbose ? console.log : undefined
  });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  return db;
};

export const initializeDatabase = async (config: DatabaseConfig = {}): Promise<Database.Database> => {
  const dbPath = config.path || path.resolve('data', 'db', 'main.sqlite');

  // Ensure directory exists
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  const database = getDatabase(config);

  // Run migrations
  runMigrations(database);

  return database;
};

const runMigrations = (database: Database.Database): void => {
  // Create migrations table if not exists
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrations = getMigrations();

  for (const migration of migrations) {
    const applied = database.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration.name);

    if (!applied) {
      console.log(`Applying migration: ${migration.name}`);
      database.exec(migration.sql);
      database.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
    }
  }
};

interface Migration {
  name: string;
  sql: string;
}

const getMigrations = (): Migration[] => [
  {
    name: '001_create_conversation_contexts',
    sql: `
      CREATE TABLE conversation_contexts (
        id TEXT PRIMARY KEY,
        slack_channel_id TEXT NOT NULL,
        slack_thread_ts TEXT,
        user_id TEXT NOT NULL,
        active_agent TEXT,
        history TEXT NOT NULL DEFAULT '[]',
        entities TEXT NOT NULL DEFAULT '{"contacts":[],"deals":[],"companies":[]}',
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX idx_context_channel ON conversation_contexts(slack_channel_id);
      CREATE INDEX idx_context_thread ON conversation_contexts(slack_channel_id, slack_thread_ts);
      CREATE INDEX idx_context_expires ON conversation_contexts(expires_at);
    `
  },
  {
    name: '002_create_drafts',
    sql: `
      CREATE TABLE drafts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        content_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        feedback TEXT
      );
      CREATE INDEX idx_drafts_status ON drafts(status);
    `
  },
  {
    name: '003_create_interviews',
    sql: `
      CREATE TABLE interviews (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `
  },
  {
    name: '004_create_topics',
    sql: `
      CREATE TABLE topics (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `
  },
  {
    name: '005_create_research_items',
    sql: `
      CREATE TABLE research_items (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        used_in_post INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_research_date ON research_items(date);
      CREATE INDEX idx_research_source ON research_items(source);
    `
  },
  {
    name: '006_create_signal_log',
    sql: `
      CREATE TABLE signal_log (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        source TEXT NOT NULL,
        observation TEXT NOT NULL,
        potential_angle TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_signal_date ON signal_log(date);
    `
  },
  {
    name: '007_create_hubspot_cache',
    sql: `
      CREATE TABLE hubspot_cache (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        hubspot_id TEXT NOT NULL,
        data TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        UNIQUE(entity_type, hubspot_id)
      );
      CREATE INDEX idx_hubspot_type ON hubspot_cache(entity_type);
    `
  }
];

export const closeDatabase = (): void => {
  if (db) {
    db.close();
    db = null;
  }
};

export default {
  getDatabase,
  initializeDatabase,
  closeDatabase
};
