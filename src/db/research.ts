// Research storage for Content Agent

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { ResearchItem, SignalLogEntry, InterviewEntry, TopicQueueItem } from '../shared/types.js';

export class ResearchStorage {
  constructor(private db: Database.Database) {}

  // --- Research Items ---

  createResearchItem(input: Omit<ResearchItem, 'id'>): ResearchItem {
    const item: ResearchItem = {
      id: randomUUID(),
      ...input
    };

    this.db.prepare(`
      INSERT INTO research_items (id, date, source, url, title, summary, tags, used_in_post)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.date,
      item.source,
      item.url,
      item.title,
      item.summary,
      JSON.stringify(item.tags),
      item.usedInPost ? 1 : 0
    );

    return item;
  }

  listResearchItems(options: { source?: string; unused?: boolean; limit?: number } = {}): ResearchItem[] {
    let query = 'SELECT * FROM research_items WHERE 1=1';
    const params: any[] = [];

    if (options.source) {
      query += ' AND source = ?';
      params.push(options.source);
    }

    if (options.unused) {
      query += ' AND used_in_post = 0';
    }

    query += ' ORDER BY date DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as ResearchRow[];
    return rows.map(this.rowToResearchItem);
  }

  markResearchUsed(id: string): void {
    this.db.prepare('UPDATE research_items SET used_in_post = 1 WHERE id = ?').run(id);
  }

  private rowToResearchItem(row: ResearchRow): ResearchItem {
    return {
      id: row.id,
      date: row.date,
      source: row.source,
      url: row.url,
      title: row.title,
      summary: row.summary,
      tags: JSON.parse(row.tags),
      usedInPost: row.used_in_post === 1
    };
  }

  // --- Signal Log ---

  createSignal(input: Omit<SignalLogEntry, 'id'>): SignalLogEntry {
    const entry: SignalLogEntry = {
      id: randomUUID(),
      ...input
    };

    this.db.prepare(`
      INSERT INTO signal_log (id, date, source, observation, potential_angle, frequency)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.date,
      entry.source,
      entry.observation,
      entry.potentialAngle,
      entry.frequency
    );

    return entry;
  }

  incrementSignalFrequency(id: string): void {
    this.db.prepare('UPDATE signal_log SET frequency = frequency + 1 WHERE id = ?').run(id);
  }

  findSimilarSignal(observation: string): SignalLogEntry | null {
    // Simple substring match - could be enhanced with fuzzy matching
    const row = this.db.prepare(`
      SELECT * FROM signal_log
      WHERE observation LIKE ? OR ? LIKE '%' || observation || '%'
      ORDER BY frequency DESC LIMIT 1
    `).get(`%${observation}%`, observation) as SignalRow | undefined;

    return row ? this.rowToSignal(row) : null;
  }

  listSignals(options: { limit?: number; minFrequency?: number } = {}): SignalLogEntry[] {
    let query = 'SELECT * FROM signal_log WHERE 1=1';
    const params: any[] = [];

    if (options.minFrequency) {
      query += ' AND frequency >= ?';
      params.push(options.minFrequency);
    }

    query += ' ORDER BY frequency DESC, date DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as SignalRow[];
    return rows.map(this.rowToSignal);
  }

  private rowToSignal(row: SignalRow): SignalLogEntry {
    return {
      id: row.id,
      date: row.date,
      source: row.source,
      observation: row.observation,
      potentialAngle: row.potential_angle,
      frequency: row.frequency
    };
  }

  // --- Interviews ---

  createInterview(question: string, answer: string): InterviewEntry {
    const entry: InterviewEntry = {
      id: randomUUID(),
      question,
      answer,
      createdAt: new Date().toISOString()
    };

    this.db.prepare(`
      INSERT INTO interviews (id, question, answer, created_at)
      VALUES (?, ?, ?, ?)
    `).run(entry.id, entry.question, entry.answer, entry.createdAt);

    return entry;
  }

  listInterviews(limit?: number): InterviewEntry[] {
    let query = 'SELECT * FROM interviews ORDER BY created_at DESC';
    if (limit) query += ` LIMIT ${limit}`;

    const rows = this.db.prepare(query).all() as InterviewRow[];
    return rows.map(row => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      createdAt: row.created_at
    }));
  }

  // --- Topics ---

  createTopic(topic: string, notes?: string): TopicQueueItem {
    const entry: TopicQueueItem = {
      id: randomUUID(),
      topic,
      notes,
      createdAt: new Date().toISOString()
    };

    this.db.prepare(`
      INSERT INTO topics (id, topic, notes, created_at)
      VALUES (?, ?, ?, ?)
    `).run(entry.id, entry.topic, entry.notes || null, entry.createdAt);

    return entry;
  }

  listTopics(limit?: number): TopicQueueItem[] {
    let query = 'SELECT * FROM topics ORDER BY created_at DESC';
    if (limit) query += ` LIMIT ${limit}`;

    const rows = this.db.prepare(query).all() as TopicRow[];
    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      notes: row.notes || undefined,
      createdAt: row.created_at
    }));
  }

  deleteTopic(id: string): void {
    this.db.prepare('DELETE FROM topics WHERE id = ?').run(id);
  }
}

interface ResearchRow {
  id: string;
  date: string;
  source: string;
  url: string;
  title: string;
  summary: string;
  tags: string;
  used_in_post: number;
}

interface SignalRow {
  id: string;
  date: string;
  source: string;
  observation: string;
  potential_angle: string;
  frequency: number;
}

interface InterviewRow {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

interface TopicRow {
  id: string;
  topic: string;
  notes: string | null;
  created_at: string;
}
