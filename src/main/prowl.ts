import { screen, type BrowserWindow } from 'electron'
import { isQuietHours } from '@shared/nag'
import { IPC, type WalkEvent } from '@shared/types'
import { loadSettings, saveSettings } from './settings'

const SPEED_PX_S = 45
const TICK_MS = 33
const MIN_DELAY_MS = 2 * 60 * 1000
const MAX_DELAY_MS = 5 * 60 * 1000
const MIN_ROAM_PX = 160
const MAX_ROAM_PX = 520

interface ProwlDeps {
  getWindow: () => BrowserWindow | null
  isPopoverOpen: () => boolean
}

/** Occasionally strolls the window to a new spot while the renderer plays the walk clip. */
export class Prowler {
  private scheduleTimer: NodeJS.Timeout | null = null
  private moveTimer: NodeJS.Timeout | null = null

  constructor(private deps: ProwlDeps) {}

  start(): void {
    this.scheduleNext()
  }

  stop(): void {
    if (this.scheduleTimer) clearTimeout(this.scheduleTimer)
    this.scheduleTimer = null
    this.cancelWalk()
  }

  /** Abort an in-progress stroll (e.g. the popover just opened). */
  cancelWalk(): void {
    if (!this.moveTimer) return
    clearInterval(this.moveTimer)
    this.moveTimer = null
    this.sendWalk(false, 1)
    this.savePosition()
  }

  /** Start a stroll immediately (tray "Take a walk"), skipping the schedule. */
  prowlNow(): void {
    this.prowl(true)
  }

  private scheduleNext(): void {
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    this.scheduleTimer = setTimeout(() => {
      this.prowl(false)
      this.scheduleNext()
    }, delay)
  }

  private prowl(force: boolean): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) return
    if (this.moveTimer || this.deps.isPopoverOpen()) return
    if (!force) {
      const s = loadSettings()
      if (isQuietHours(new Date(), s.quietStart, s.quietEnd)) return
    }

    const bounds = win.getBounds()
    const wa = screen.getDisplayMatching(bounds).workArea

    // Roam to a random point in the work area within walking distance.
    const angle = Math.random() * Math.PI * 2
    const dist = MIN_ROAM_PX + Math.random() * (MAX_ROAM_PX - MIN_ROAM_PX)
    const targetX = Math.max(
      wa.x + 8,
      Math.min(wa.x + wa.width - bounds.width - 8, bounds.x + Math.cos(angle) * dist)
    )
    const targetY = Math.max(
      wa.y + 8,
      Math.min(wa.y + wa.height - bounds.height - 8, bounds.y + Math.sin(angle) * 0.5 * dist)
    )
    const dx = targetX - bounds.x
    const dy = targetY - bounds.y
    const total = Math.hypot(dx, dy)
    if (total < 80) return // cornered — try again next time

    const dir: -1 | 1 = dx >= 0 ? 1 : -1
    this.sendWalk(true, dir)

    let traveled = 0
    this.moveTimer = setInterval(() => {
      const w = this.deps.getWindow()
      if (!w || w.isDestroyed()) {
        this.cancelWalk()
        return
      }
      traveled += SPEED_PX_S * (TICK_MS / 1000)
      const p = Math.min(1, traveled / total)
      w.setPosition(Math.round(bounds.x + dx * p), Math.round(bounds.y + dy * p))
      if (p >= 1) this.cancelWalk()
    }, TICK_MS)
  }

  private sendWalk(walking: boolean, dir: -1 | 1): void {
    const event: WalkEvent = { walking, dir }
    this.deps.getWindow()?.webContents.send(IPC.evWalk, event)
  }

  private savePosition(): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return
    const [x, y] = win.getPosition()
    saveSettings({ x, y })
  }
}
