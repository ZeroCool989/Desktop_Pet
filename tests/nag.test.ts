import { describe, expect, it } from 'vitest'
import {
  NAG_COOLDOWN_MS,
  buildMotivationLine,
  buildNagLine,
  buildPraiseLine,
  dayPart,
  escalationLevel,
  formatClockTime,
  formatTaskList,
  isQuietHours,
  selectNaggable,
  type NaggableTask
} from '@shared/nag'

const NOW = Date.parse('2026-07-07T12:00:00')

function task(overrides: Partial<NaggableTask> = {}): NaggableTask {
  return {
    id: 1,
    title: 'gym',
    dueAt: NOW - 60_000, // overdue by a minute
    done: false,
    naggedAt: null,
    nagCount: 0,
    ...overrides
  }
}

describe('selectNaggable (cooldown logic)', () => {
  it('includes overdue tasks never nagged before', () => {
    expect(selectNaggable([task()], NOW)).toHaveLength(1)
  })

  it('excludes tasks nagged inside the 45-minute cooldown', () => {
    const t = task({ naggedAt: NOW - 10 * 60_000 })
    expect(selectNaggable([t], NOW)).toHaveLength(0)
  })

  it('excludes a task nagged 44 minutes ago, includes at exactly 45', () => {
    expect(selectNaggable([task({ naggedAt: NOW - 44 * 60_000 })], NOW)).toHaveLength(0)
    expect(selectNaggable([task({ naggedAt: NOW - NAG_COOLDOWN_MS })], NOW)).toHaveLength(1)
  })

  it('excludes done, future, and undated tasks', () => {
    expect(selectNaggable([task({ done: true })], NOW)).toHaveLength(0)
    expect(selectNaggable([task({ dueAt: NOW + 60_000 })], NOW)).toHaveLength(0)
    expect(selectNaggable([task({ dueAt: null })], NOW)).toHaveLength(0)
  })
})

describe('isQuietHours', () => {
  const at = (hour: number): Date => new Date(2026, 6, 7, hour, 30)

  it('wraps across midnight for the default 22 → 8 window', () => {
    expect(isQuietHours(at(23))).toBe(true)
    expect(isQuietHours(at(3))).toBe(true)
    expect(isQuietHours(at(12))).toBe(false)
    expect(isQuietHours(at(22))).toBe(true)
    expect(isQuietHours(at(8))).toBe(false)
    expect(isQuietHours(at(21))).toBe(false)
  })

  it('supports non-wrapping windows and a disabled window', () => {
    expect(isQuietHours(at(13), 12, 14)).toBe(true)
    expect(isQuietHours(at(15), 12, 14)).toBe(false)
    expect(isQuietHours(at(13), 9, 9)).toBe(false)
  })
})

describe('escalation and phrasing', () => {
  it('escalates with nag count and caps at sarcastic (2)', () => {
    expect(escalationLevel([task()])).toBe(0)
    expect(escalationLevel([task(), task({ nagCount: 1 })])).toBe(1)
    expect(escalationLevel([task({ nagCount: 7 })])).toBe(2)
  })

  it('lists up to 2 titles then "and N more"', () => {
    expect(formatTaskList(['a'])).toBe("'a'")
    expect(formatTaskList(['a', 'b'])).toBe("'a' and 'b'")
    expect(formatTaskList(['a', 'b', 'c', 'd'])).toBe("'a' and 'b' and 2 more")
  })

  it('addresses the user by name and includes task titles', () => {
    const line = buildNagLine('Almir', ['finish the client deck', 'gym'], 0, 0)
    expect(line).toContain('Almir')
    expect(line).toContain("'finish the client deck'")
    expect(line).toContain("'gym'")
  })

  it('rotates phrasings between consecutive nags at the same level', () => {
    const a = buildNagLine('Almir', ['gym'], 1, 0)
    const b = buildNagLine('Almir', ['gym'], 1, 1)
    const c = buildNagLine('Almir', ['gym'], 1, 2)
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('produces praise lines with the user name', () => {
    expect(buildPraiseLine('Almir', 0)).toContain('Almir')
  })
})

describe('time awareness', () => {
  const afternoon = new Date(2026, 6, 7, 15, 4)

  it('maps hours to day parts', () => {
    expect(dayPart(new Date(2026, 6, 7, 8))).toBe('morning')
    expect(dayPart(new Date(2026, 6, 7, 15))).toBe('afternoon')
    expect(dayPart(new Date(2026, 6, 7, 19))).toBe('evening')
    expect(dayPart(new Date(2026, 6, 7, 23))).toBe('night')
    expect(dayPart(new Date(2026, 6, 7, 3))).toBe('night')
  })

  it('speaks the current clock time in time-referencing phrasings', () => {
    const line = buildNagLine('Almir', ['gym'], 0, 0, afternoon)
    expect(line).toContain(formatClockTime(afternoon))
  })

  it('mentions the day part where templates use it', () => {
    const line = buildNagLine('Almir', ['gym'], 1, 1, afternoon)
    expect(line).toContain('afternoon')
  })

  it('leaves no unfilled placeholders in any template', () => {
    for (const level of [0, 1, 2] as const) {
      for (let rotation = 0; rotation < 3; rotation++) {
        const line = buildNagLine('Almir', ['a', 'b', 'c'], level, rotation, afternoon)
        expect(line).not.toMatch(/\{(name|tasks|time|daypart)\}/)
      }
    }
    for (let rotation = 0; rotation < 3; rotation++) {
      expect(buildPraiseLine('Almir', rotation, afternoon)).not.toMatch(/\{/)
    }
  })
})

describe('motivation lines', () => {
  const noon = new Date(2026, 6, 7, 12, 0)

  it('addresses the user, rotates, and fills all placeholders', () => {
    const lines = Array.from({ length: 9 }, (_, i) => buildMotivationLine('Almir', i, noon))
    for (const line of lines) {
      expect(line).toContain('Almir')
      expect(line).not.toMatch(/\{/)
    }
    expect(new Set(lines).size).toBeGreaterThan(5)
  })
})
