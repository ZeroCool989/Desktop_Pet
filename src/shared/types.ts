export interface Task {
  id: number
  title: string
  /** epoch ms, null if no due date */
  dueAt: number | null
  done: boolean
  createdAt: number
  naggedAt: number | null
  nagCount: number
}

export interface NagEvent {
  text: string
  durationMs: number
}

/** Direction of the OS cursor relative to the window center, each in [-1, 1]. */
export interface CursorEvent {
  dx: number
  dy: number
}

/** Main is sliding the window across the screen; renderer plays the walk clip. */
export interface WalkEvent {
  walking: boolean
  /** -1 = moving left, 1 = moving right */
  dir: -1 | 1
}

export interface ModelFile {
  name: string
  bytes: Uint8Array
}

export interface PantherApi {
  listTasks(): Promise<Task[]>
  /** Parses free-form lines and inserts tasks. Returns the updated open-task list. */
  addTasksFromText(text: string): Promise<Task[]>
  setTaskDone(id: number, done: boolean): Promise<Task[]>
  deleteTask(id: number): Promise<Task[]>
  /** Tell main to grow/shrink the window for the popover. */
  setPopoverOpen(open: boolean): Promise<void>
  /** Manual window dragging: begin on pointer-down… */
  beginDrag(): void
  /** …stream cursor deltas (screen px relative to drag start)… */
  dragTo(dx: number, dy: number): void
  /** …and finish on pointer-up (persists the new position). */
  endDrag(): void
  /**
   * Raw bytes of every .glb in assets/. All files must share a rig; the first
   * is the display model and animation clips are merged across all of them.
   */
  readModels(): Promise<ModelFile[]>
  onNag(cb: (e: NagEvent) => void): () => void
  onTogglePopover(cb: () => void): () => void
  onCursor(cb: (e: CursorEvent) => void): () => void
  onWalk(cb: (e: WalkEvent) => void): () => void
}

export const IPC = {
  tasksList: 'tasks:list',
  tasksAddFromText: 'tasks:add-from-text',
  tasksSetDone: 'tasks:set-done',
  tasksDelete: 'tasks:delete',
  windowSetPopover: 'window:set-popover',
  dragStart: 'drag:start',
  dragMove: 'drag:move',
  dragEnd: 'drag:end',
  modelRead: 'model:read',
  evNag: 'panther:nag',
  evTogglePopover: 'popover:toggle',
  evCursor: 'cursor:pos',
  evWalk: 'panther:walk'
} as const
