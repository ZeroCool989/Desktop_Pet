import { BrowserWindow, app, globalShortcut, screen } from 'electron'
import { join } from 'path'
import { initDb } from './db'
import { WINDOW_HEIGHT, WINDOW_WIDTH, registerIpc } from './ipc'
import { Prowler } from './prowl'
import { Scheduler } from './scheduler'
import { loadSettings, saveSettings } from './settings'
import { createTray } from './tray'
import { speak } from './tts'
import { IPC, type CursorEvent } from '@shared/types'

let win: BrowserWindow | null = null
let savePosTimer: NodeJS.Timeout | null = null
let cursorTimer: NodeJS.Timeout | null = null

function defaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - WINDOW_WIDTH - 24,
    y: workArea.y + workArea.height - WINDOW_HEIGHT - 24
  }
}

/** Reject saved positions that are fully off every current display. */
function onScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const b = d.workArea
    return (
      x + WINDOW_WIDTH > b.x + 20 &&
      x < b.x + b.width - 20 &&
      y > b.y - 20 &&
      y < b.y + b.height - 40
    )
  })
}

function createWindow(): BrowserWindow {
  const s = loadSettings()
  const pos =
    s.x !== undefined && s.y !== undefined && onScreen(s.x, s.y)
      ? { x: s.x, y: s.y }
      : defaultPosition()

  const w = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  w.setAlwaysOnTop(true, 'floating')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.once('ready-to-show', () => w.show())

  w.on('moved', () => {
    if (savePosTimer) clearTimeout(savePosTimer)
    savePosTimer = setTimeout(() => {
      if (!w.isDestroyed()) {
        const [x, y] = w.getPosition()
        saveSettings({ x, y })
      }
    }, 500)
  })

  w.on('closed', () => {
    win = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void w.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return w
}

/** Feed the renderer the OS cursor position so the panther can watch it anywhere on screen. */
function startCursorTracking(): void {
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return
    const cursor = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const event: CursorEvent = {
      dx: Math.max(-1, Math.min(1, (cursor.x - cx) / 600)),
      dy: Math.max(-1, Math.min(1, (cursor.y - cy) / 600))
    }
    win.webContents.send(IPC.evCursor, event)
  }, 150)
}

function togglePopover(): void {
  if (!win) return
  win.show()
  win.webContents.send(IPC.evTogglePopover)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => win?.show())

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide()

    initDb()
    win = createWindow()

    let popoverOpen = false
    const scheduler = new Scheduler({ getWindow: () => win, speak })
    const prowler = new Prowler({ getWindow: () => win, isPopoverOpen: () => popoverOpen })
    registerIpc({
      getWindow: () => win,
      scheduler,
      onPopoverChange: (open) => {
        popoverOpen = open
        if (open) prowler.cancelWalk()
      },
      onDragStart: () => prowler.cancelWalk()
    })
    createTray({ scheduler, prowler, openTasks: togglePopover })
    scheduler.start()
    prowler.start()
    startCursorTracking()

    globalShortcut.register('CommandOrControl+Shift+P', togglePopover)

    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
      if (cursorTimer) clearInterval(cursorTimer)
      prowler.stop()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
