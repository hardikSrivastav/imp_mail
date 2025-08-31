import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

let db: Database | null = null;

/**
 * Initialize database connection and run migrations
 */
export async function initializeDatabase(): Promise<Database> {
  const database = await getDatabase();
  
  // Run migrations here if needed
  console.log('✅ Database initialized');
  
  return database;
}

/**
 * Get or create database connection
 */
export async function getDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  // Use PostgreSQL in production if DATABASE_URL is set, otherwise SQLite
  if (process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
    console.log('🚀 Production mode detected - please use PostgreSQL setup');
    throw new Error('Production mode requires PostgreSQL. Please set up PostgreSQL migration.');
  }

  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'emails.db');
  
  // Ensure directory exists
  const fs = require('fs');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON');
  
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}