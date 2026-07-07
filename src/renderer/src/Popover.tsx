import { useEffect, useState } from 'react'
import type { Task } from '@shared/types'

interface PopoverProps {
  onClose: () => void
}

function formatDue(dueAt: number | null): string {
  if (dueAt === null) return ''
  const due = new Date(dueAt)
  const now = new Date()
  const time = due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = due.toDateString() === now.toDateString()
  if (sameDay) return time
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (due.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`
  return `${due.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export default function Popover({ onClose }: PopoverProps): JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.panther.listTasks().then(setTasks)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      setTasks(await window.panther.addTasksFromText(text))
      setDraft('')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (t: Task): Promise<void> => {
    setTasks(await window.panther.setTaskDone(t.id, !t.done))
  }

  const remove = async (t: Task): Promise<void> => {
    setTasks(await window.panther.deleteTask(t.id))
  }

  const now = Date.now()

  return (
    <div className="popover no-drag">
      <div className="popover-head">
        <span>Tasks</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <textarea
        className="task-input"
        rows={3}
        value={draft}
        placeholder={'finish client deck by 15:00\ncall dentist tomorrow 9am\ngym tonight'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
        }}
      />
      <button className="add-btn" onClick={() => void save()} disabled={saving || !draft.trim()}>
        Add tasks
      </button>

      <ul className="task-list">
        {tasks.length === 0 && <li className="empty">No tasks. The panther approves.</li>}
        {tasks.map((t) => {
          const overdue = !t.done && t.dueAt !== null && t.dueAt <= now
          return (
            <li key={t.id} className={t.done ? 'done' : overdue ? 'overdue' : ''}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => void toggle(t)} />
                <span className="title">{t.title}</span>
              </label>
              <span className="due">{formatDue(t.dueAt)}</span>
              <button className="icon-btn" onClick={() => void remove(t)} aria-label="Delete">
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
