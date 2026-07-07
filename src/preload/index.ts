import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type CursorEvent,
  type NagEvent,
  type PantherApi,
  type WalkEvent
} from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: PantherApi = {
  listTasks: () => ipcRenderer.invoke(IPC.tasksList),
  addTasksFromText: (text: string) => ipcRenderer.invoke(IPC.tasksAddFromText, text),
  setTaskDone: (id: number, done: boolean) => ipcRenderer.invoke(IPC.tasksSetDone, id, done),
  deleteTask: (id: number) => ipcRenderer.invoke(IPC.tasksDelete, id),
  setPopoverOpen: (open: boolean) => ipcRenderer.invoke(IPC.windowSetPopover, open),
  beginDrag: () => ipcRenderer.send(IPC.dragStart),
  dragTo: (dx: number, dy: number) => ipcRenderer.send(IPC.dragMove, dx, dy),
  endDrag: () => ipcRenderer.send(IPC.dragEnd),
  readModels: () => ipcRenderer.invoke(IPC.modelRead),
  onNag: (cb: (e: NagEvent) => void) => subscribe(IPC.evNag, cb),
  onTogglePopover: (cb: () => void) => subscribe(IPC.evTogglePopover, cb),
  onCursor: (cb: (e: CursorEvent) => void) => subscribe(IPC.evCursor, cb),
  onWalk: (cb: (e: WalkEvent) => void) => subscribe(IPC.evWalk, cb)
}

contextBridge.exposeInMainWorld('panther', api)
