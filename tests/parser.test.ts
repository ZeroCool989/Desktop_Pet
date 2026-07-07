import { describe, expect, it } from 'vitest'
import { parseTaskLines } from '@shared/parser'

// Tuesday July 7 2026, 10:00 local time
const NOW = new Date(2026, 6, 7, 10, 0, 0)

describe('parseTaskLines', () => {
  it('extracts an explicit time and strips the date phrase from the title', () => {
    const [task] = parseTaskLines('finish client deck by 15:00', NOW)
    expect(task.title).toBe('finish client deck')
    const due = new Date(task.dueAt)
    expect(due.getHours()).toBe(15)
    expect(due.getMinutes()).toBe(0)
    expect(due.getDate()).toBe(7)
  })

  it('parses relative days like "tomorrow 9am"', () => {
    const [task] = parseTaskLines('call dentist tomorrow 9am', NOW)
    expect(task.title).toBe('call dentist')
    const due = new Date(task.dueAt)
    expect(due.getDate()).toBe(8)
    expect(due.getMonth()).toBe(6)
    expect(due.getHours()).toBe(9)
  })

  it('handles casual phrases like "tonight" and keeps a clean title', () => {
    const [task] = parseTaskLines('gym tonight', NOW)
    expect(task.title).toBe('gym')
    const due = new Date(task.dueAt)
    expect(due.getDate()).toBe(7)
    expect(due.getHours()).toBeGreaterThanOrEqual(18)
  })

  it('defaults lines without a time to today 18:00', () => {
    const [task] = parseTaskLines('buy milk', NOW)
    expect(task.title).toBe('buy milk')
    const due = new Date(task.dueAt)
    expect(due.getDate()).toBe(7)
    expect(due.getHours()).toBe(18)
    expect(due.getMinutes()).toBe(0)
  })

  it('parses multiple lines and skips blank ones', () => {
    const tasks = parseTaskLines(
      'finish client deck by 15:00\n\n   \ncall dentist tomorrow 9am\ngym tonight',
      NOW
    )
    expect(tasks).toHaveLength(3)
    expect(tasks.map((t) => t.title)).toEqual(['finish client deck', 'call dentist', 'gym'])
  })

  it('keeps the raw line as title when the line is only a date', () => {
    const [task] = parseTaskLines('tomorrow 9am', NOW)
    expect(task.title).toBe('tomorrow 9am')
  })

  it('returns an empty array for empty input', () => {
    expect(parseTaskLines('   \n \n', NOW)).toEqual([])
  })
})
