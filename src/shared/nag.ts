export const NAG_COOLDOWN_MS = 45 * 60 * 1000
export const CHECK_INTERVAL_MS = 10 * 60 * 1000
/** Minimum gap between unsolicited motivational speeches. */
export const MOTIVATION_GAP_MS = 2 * 60 * 60 * 1000
/** Chance per 10-minute check (once past the gap) that a speech fires. */
export const MOTIVATION_CHANCE = 0.25

export interface NaggableTask {
  id: number
  title: string
  dueAt: number | null
  done: boolean
  naggedAt: number | null
  nagCount: number
}

/** Overdue, not done, and outside the per-task nag cooldown. */
export function selectNaggable<T extends NaggableTask>(
  tasks: T[],
  now: number,
  cooldownMs: number = NAG_COOLDOWN_MS
): T[] {
  return tasks.filter(
    (t) =>
      !t.done &&
      t.dueAt !== null &&
      t.dueAt <= now &&
      (t.naggedAt === null || now - t.naggedAt >= cooldownMs)
  )
}

/** Quiet hours wrap over midnight, e.g. 22 → 8. start === end disables quiet hours. */
export function isQuietHours(date: Date, startHour = 22, endHour = 8): boolean {
  const h = date.getHours()
  if (startHour === endHour) return false
  if (startHour < endHour) return h >= startHour && h < endHour
  return h >= startHour || h < endHour
}

/** 0 = friendly, 1 = firmer, 2 = sarcastic. Driven by how often we've already nagged. */
export function escalationLevel(tasks: Pick<NaggableTask, 'nagCount'>[]): 0 | 1 | 2 {
  const worst = Math.max(0, ...tasks.map((t) => t.nagCount))
  return Math.min(2, worst) as 0 | 1 | 2
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night'

export function dayPart(date: Date): DayPart {
  const h = date.getHours()
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

/** Clock time the way TTS reads it naturally, e.g. "3:04 PM". */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const PHRASES: Record<0 | 1 | 2, string[]> = {
  0: [
    "{name}, it's {time} and you still have {tasks} to finish.",
    '{daypart} check-in, {name}: {tasks} are still open.',
    "{name}, whenever you're ready: {tasks} are waiting."
  ],
  1: [
    "{name}, it's already {time} and {tasks} are overdue. Time to move.",
    'Seriously, {name} — {tasks}. The {daypart} is slipping away.',
    "{name}, I'm not going anywhere until {tasks} get done."
  ],
  2: [
    "Oh look, {name}: {time} and {tasks} are still not done. Shocking.",
    "{name}, at this point {tasks} are practically vintage. It's {time}, by the way.",
    'A panther hunts, {name}. Meanwhile {tasks} have been sitting there all {daypart}.'
  ]
}

const PRAISE = [
  'Nice work, {name}. All clear.',
  "That's more like it, {name}. Enjoy the rest of your {daypart}.",
  "Clean slate at {time}, {name}. I'll go nap now."
]

/** Tough-love pep talks, delivered occasionally while tasks sit open. */
const MOTIVATION = [
  "You say you want change, {name}, but change takes commitment — and right now you're choosing comfort.",
  '{name}, nobody is coming to do it for you. Not today, not ever.',
  "Every task you push to tomorrow is a vote for the person you said you didn't want to be, {name}.",
  'Comfortable is how you got here, {name}. Uncomfortable is how you get out.',
  "{name}, you don't lack time — you lack a decision. Make it.",
  'Discipline is remembering what you want most, {name}, not what you want right now.',
  'You want results without commitment, {name}. That math has never worked.',
  "The couch will still be there after the work is done, {name}. Your excuses shouldn't be.",
  "Future you is watching this {daypart}, {name}, and they're taking notes."
]

function fillTemplate(template: string, name: string, tasksStr: string, now: Date): string {
  return template
    .replaceAll('{name}', name)
    .replaceAll('{tasks}', tasksStr)
    .replaceAll('{time}', formatClockTime(now))
    .replaceAll('{daypart}', dayPart(now))
}

/** Up to 2 quoted titles, then "and N more". */
export function formatTaskList(titles: string[]): string {
  const shown = titles.slice(0, 2).map((t) => `'${t}'`)
  const extra = titles.length - shown.length
  const joined = shown.join(' and ')
  return extra > 0 ? `${joined} and ${extra} more` : joined
}

/** `rotation` is a monotonically increasing counter so consecutive nags vary. */
export function buildNagLine(
  name: string,
  titles: string[],
  level: 0 | 1 | 2,
  rotation: number,
  now: Date = new Date()
): string {
  const variants = PHRASES[level]
  const template = variants[rotation % variants.length]
  return fillTemplate(template, name, formatTaskList(titles), now)
}

export function buildPraiseLine(name: string, rotation: number, now: Date = new Date()): string {
  return fillTemplate(PRAISE[rotation % PRAISE.length], name, '', now)
}

export function buildMotivationLine(
  name: string,
  rotation: number,
  now: Date = new Date()
): string {
  return fillTemplate(MOTIVATION[rotation % MOTIVATION.length], name, '', now)
}

/** Rough speech duration so the talk animation matches the voice line. */
export function estimateSpeechMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.min(20_000, 1_000 + words * 380)
}
