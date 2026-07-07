import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import type { Task } from '@shared/types'

interface TaskRow {
  id: number
  title: string
  due_at: number | null
  done: number
  created_at: number
  nagged_at: number | null
  nag_count: number
}

let db: Database.Database

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    dueAt: r.due_at,
    done: r.done === 1,
    createdAt: r.created_at,
    naggedAt: r.nagged_at,
    nagCount: r.nag_count
  }
}

export function initDb(dbPath: string = join(app.getPath('userData'), 'panther.db')): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      due_at     INTEGER,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      nagged_at  INTEGER,
      nag_count  INTEGER NOT NULL DEFAULT 0
    )
  `)
}

export const tasksRepo = {
  /** Open tasks first (oldest due first), then recently completed ones. */
  list(): Task[] {
    const rows = db
      .prepare(
        `SELECT * FROM tasks
         ORDER BY done ASC, due_at IS NULL, due_at ASC, created_at ASC`
      )
      .all() as TaskRow[]
    return rows.map(rowToTask)
  },

  add(items: { title: string; dueAt: number | null }[]): void {
    const stmt = db.prepare(
      'INSERT INTO tasks (title, due_at, done, created_at) VALUES (?, ?, 0, ?)'
    )
    const insertAll = db.transaction((rows: { title: string; dueAt: number | null }[]) => {
      const now = Date.now()
      for (const r of rows) stmt.run(r.title, r.dueAt, now)
    })
    insertAll(items)
  },

  setDone(id: number, done: boolean): void {
    db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(done ? 1 : 0, id)
  },

  remove(id: number): void {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  },

  /** All overdue, not-done tasks (cooldown filtering happens in shared/nag.ts). */
  overdue(now: number): Task[] {
    const rows = db
      .prepare(
        `SELECT * FROM tasks
         WHERE done = 0 AND due_at IS NOT NULL AND due_at <= ?
         ORDER BY due_at ASC`
      )
      .all(now) as TaskRow[]
    return rows.map(rowToTask)
  },

  countOpen(): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE done = 0').get() as {
      n: number
    }
    return row.n
  },

  countOverdue(now: number): number {
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM tasks WHERE done = 0 AND due_at IS NOT NULL AND due_at <= ?')
      .get(now) as { n: number }
    return row.n
  },

  markNagged(ids: number[], now: number): void {
    const stmt = db.prepare('UPDATE tasks SET nagged_at = ?, nag_count = nag_count + 1 WHERE id = ?')
    const run = db.transaction((taskIds: number[]) => {
      for (const id of taskIds) stmt.run(now, id)
    })
    run(ids)
  }
}
