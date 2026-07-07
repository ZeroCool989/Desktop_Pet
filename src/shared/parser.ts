import * as chrono from 'chrono-node'

export interface ParsedTask {
  title: string
  /** epoch ms */
  dueAt: number
}

const DEFAULT_DUE_HOUR = 18

/** Trailing connectives left behind once the date phrase is removed ("… by", "… at"). */
const TRAILING_CONNECTIVE = /\s+(by|at|on|due|before|until|till|for)$/i

function defaultDue(now: Date): number {
  const d = new Date(now)
  d.setHours(DEFAULT_DUE_HOUR, 0, 0, 0)
  return d.getTime()
}

function stripDatePhrase(line: string, index: number, matched: string): string {
  let title = (line.slice(0, index) + ' ' + line.slice(index + matched.length))
    .replace(/\s+/g, ' ')
    .trim()
  title = title.replace(/[\s,;:\-–—]+$/, '').replace(TRAILING_CONNECTIVE, '').trim()
  return title
}

/**
 * Parses free-form to-do lines, one task per non-empty line.
 * Lines with a recognizable date/time (via chrono-node) use it as the due date;
 * everything else defaults to today at 18:00.
 */
export function parseTaskLines(text: string, now: Date = new Date()): ParsedTask[] {
  const tasks: ParsedTask[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const results = chrono.parse(line, now, { forwardDate: true })
    const hit = results[0]
    if (hit) {
      const title = stripDatePhrase(line, hit.index, hit.text)
      tasks.push({
        // A line that is *only* a date ("tomorrow 9am") keeps the raw line as title.
        title: title || line,
        dueAt: hit.start.date().getTime()
      })
    } else {
      tasks.push({ title: line, dueAt: defaultDue(now) })
    }
  }
  return tasks
}
