// Draft storage for Content Agent

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { Draft, ContentType, ApprovalStatus } from '../shared/types.js';

export class DraftStorage {
  constructor(private db: Database.Database) {}

  // Create a new draft
  create(input: { title: string; body: string; contentType: ContentType }): Draft {
    const now = new Date().toISOString();
    const draft: Draft = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      contentType: input.contentType,
      createdAt: now,
      updatedAt: now,
      status: 'pending'
    };

    this.db.prepare(`
      INSERT INTO drafts (id, title, body, content_type, created_at, updated_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.title,
      draft.body,
      draft.contentType,
      draft.createdAt,
      draft.updatedAt,
      draft.status
    );

    return draft;
  }

  // Get all drafts
  list(): Draft[] {
    const rows = this.db.prepare('SELECT * FROM drafts ORDER BY created_at DESC').all() as DraftRow[];
    return rows.map(this.rowToDraft);
  }

  // Get drafts by status
  listByStatus(status: ApprovalStatus): Draft[] {
    const rows = this.db.prepare('SELECT * FROM drafts WHERE status = ? ORDER BY created_at DESC').all(status) as DraftRow[];
    return rows.map(this.rowToDraft);
  }

  // Get a draft by ID
  get(id: string): Draft | null {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRow | undefined;
    return row ? this.rowToDraft(row) : null;
  }

  // Update a draft
  update(id: string, updates: { title?: string; body?: string }): Draft {
    const draft = this.get(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE drafts
      SET title = ?, body = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.title ?? draft.title,
      updates.body ?? draft.body,
      now,
      id
    );

    return this.get(id)!;
  }

  // Update draft status
  updateStatus(id: string, status: ApprovalStatus, feedback?: string): Draft {
    const draft = this.get(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE drafts
      SET status = ?, feedback = ?, updated_at = ?
      WHERE id = ?
    `).run(status, feedback || null, now, id);

    return this.get(id)!;
  }

  // Delete a draft
  delete(id: string): void {
    const draft = this.get(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  }

  // Convert row to Draft
  private rowToDraft(row: DraftRow): Draft {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      contentType: row.content_type as ContentType,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status as ApprovalStatus,
      feedback: row.feedback || undefined
    };
  }
}

interface DraftRow {
  id: string;
  title: string;
  body: string;
  content_type: string;
  created_at: string;
  updated_at: string;
  status: string;
  feedback: string | null;
}
