import { app, ipcMain, type BrowserWindow } from 'electron'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { tasksRepo } from './db'
import { loadSettings, saveSettings } from './settings'
import { parseTaskLines } from '@shared/parser'
import { IPC, type ModelFile, type Task } from '@shared/types'
import type { Scheduler } from './scheduler'

export const WINDOW_WIDTH = 280
export const WINDOW_HEIGHT = 320
export const WINDOW_HEIGHT_POPOVER = 560

const AddTextSchema = z.string().min(1).max(10_000)
const IdSchema = z.number().int().positive()
const BoolSchema = z.boolean()
const DragDeltaSchema = z.number().finite().min(-20_000).max(20_000)
const NameSchema = z.string().trim().min(1).max(60)

function assetsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets')
    : join(app.getAppPath(), 'assets')
}

interface IpcDeps {
  getWindow: () => BrowserWindow | null
  scheduler: Scheduler
  onPopoverChange?: (open: boolean) => void
  onDragStart?: () => void
}

export function registerIpc({ getWindow, scheduler, onPopoverChange, onDragStart }: IpcDeps): void {
  ipcMain.handle(IPC.tasksList, (): Task[] => tasksRepo.list())

  ipcMain.handle(IPC.tasksAddFromText, (_e, raw: unknown): Task[] => {
    const text = AddTextSchema.parse(raw)
    const parsed = parseTaskLines(text)
    if (parsed.length > 0) tasksRepo.add(parsed)
    return tasksRepo.list()
  })

  ipcMain.handle(IPC.tasksSetDone, (_e, rawId: unknown, rawDone: unknown): Task[] => {
    const id = IdSchema.parse(rawId)
    const done = BoolSchema.parse(rawDone)
    tasksRepo.setDone(id, done)
    if (done) scheduler.onTaskCompleted()
    return tasksRepo.list()
  })

  ipcMain.handle(IPC.tasksDelete, (_e, rawId: unknown): Task[] => {
    tasksRepo.remove(IdSchema.parse(rawId))
    return tasksRepo.list()
  })

  ipcMain.handle(IPC.windowSetPopover, (_e, rawOpen: unknown): void => {
    const open = BoolSchema.parse(rawOpen)
    onPopoverChange?.(open)
    const win = getWindow()
    if (!win) return
    const [x, y] = win.getPosition()
    win.setBounds({
      x,
      y,
      width: WINDOW_WIDTH,
      height: open ? WINDOW_HEIGHT_POPOVER : WINDOW_HEIGHT
    })
  })

  // Manual mouse dragging: renderer streams cursor deltas relative to drag start.
  let dragOrigin: { x: number; y: number } | null = null

  ipcMain.on(IPC.dragStart, () => {
    const win = getWindow()
    if (!win) return
    const [x, y] = win.getPosition()
    dragOrigin = { x, y }
    onDragStart?.()
  })

  ipcMain.on(IPC.dragMove, (_e, rawDx: unknown, rawDy: unknown) => {
    const win = getWindow()
    if (!win || !dragOrigin) return
    const dx = DragDeltaSchema.parse(rawDx)
    const dy = DragDeltaSchema.parse(rawDy)
    win.setPosition(Math.round(dragOrigin.x + dx), Math.round(dragOrigin.y + dy))
  })

  ipcMain.on(IPC.dragEnd, () => {
    dragOrigin = null
    const win = getWindow()
    if (!win) return
    const [x, y] = win.getPosition()
    saveSettings({ x, y })
  })

  ipcMain.handle(IPC.settingsGetUserName, (): string => loadSettings().userName)

  ipcMain.handle(IPC.settingsSetUserName, (_e, raw: unknown): void => {
    saveSettings({ userName: NameSchema.parse(raw) })
  })

  ipcMain.handle(IPC.modelRead, (): ModelFile[] => {
    try {
      return readdirSync(assetsDir())
        .filter((f) => f.toLowerCase().endsWith('.glb'))
        .sort()
        .map((f) => ({
          name: f,
          bytes: new Uint8Array(readFileSync(join(assetsDir(), f)))
        }))
    } catch (err) {
      console.error('Failed to read models from assets/:', err)
      return []
    }
  })
}
