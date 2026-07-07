import type { BrowserWindow } from 'electron'
import { tasksRepo } from './db'
import { loadSettings } from './settings'
import {
  CHECK_INTERVAL_MS,
  MOTIVATION_CHANCE,
  MOTIVATION_GAP_MS,
  NAG_COOLDOWN_MS,
  buildMotivationLine,
  buildNagLine,
  buildPraiseLine,
  escalationLevel,
  estimateSpeechMs,
  isQuietHours,
  selectNaggable
} from '@shared/nag'
import { IPC, type NagEvent } from '@shared/types'

interface SchedulerOpts {
  getWindow: () => BrowserWindow | null
  speak: (text: string) => Promise<void>
}

export class Scheduler {
  private muteUntil = 0
  private rotation = 0
  private naggedSinceClear = false
  private lastMotivation = 0
  private timer: NodeJS.Timeout | null = null

  constructor(private opts: SchedulerOpts) {}

  start(): void {
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
    // First pass shortly after launch so overdue tasks don't wait 10 minutes.
    setTimeout(() => void this.check(), 20_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  get muted(): boolean {
    return Date.now() < this.muteUntil
  }

  get mutedUntil(): number {
    return this.muteUntil
  }

  muteFor(ms: number): void {
    this.muteUntil = Date.now() + ms
  }

  muteToday(): void {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    this.muteUntil = end.getTime()
  }

  unmute(): void {
    this.muteUntil = 0
  }

  async check(now: number = Date.now()): Promise<void> {
    if (this.muted) return
    const s = loadSettings()
    if (isQuietHours(new Date(now), s.quietStart, s.quietEnd)) return

    const due = selectNaggable(tasksRepo.overdue(now), now, NAG_COOLDOWN_MS)
    if (due.length === 0) {
      this.maybeMotivate(now, s.userName, s.motivation)
      return
    }

    const level = escalationLevel(due)
    const line = buildNagLine(
      s.userName,
      due.map((t) => t.title),
      level,
      this.rotation++,
      new Date(now)
    )
    tasksRepo.markNagged(
      due.map((t) => t.id),
      now
    )
    this.naggedSinceClear = true
    this.deliver(line)
  }

  /** Occasional tough-love pep talk while tasks sit open (never right after a nag). */
  private maybeMotivate(now: number, userName: string, enabled: boolean): void {
    if (!enabled) return
    if (now - this.lastMotivation < MOTIVATION_GAP_MS) return
    if (tasksRepo.countOpen() === 0) return
    if (Math.random() > MOTIVATION_CHANCE) return
    this.lastMotivation = now
    this.deliver(buildMotivationLine(userName, this.rotation++, new Date(now)))
  }

  /** Called when a task gets checked off — praise once everything overdue is clear. */
  onTaskCompleted(): void {
    if (!this.naggedSinceClear) return
    if (tasksRepo.countOverdue(Date.now()) > 0) return
    this.naggedSinceClear = false
    if (this.muted) return
    this.deliver(buildPraiseLine(loadSettings().userName, this.rotation++))
  }

  private deliver(line: string): void {
    const event: NagEvent = { text: line, durationMs: estimateSpeechMs(line) }
    this.opts.getWindow()?.webContents.send(IPC.evNag, event)
    void this.opts.speak(line).catch((err) => console.error('TTS error:', err))
  }
}
