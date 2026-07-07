import { useState } from 'react'

interface NamePromptProps {
  onDone: (name: string) => void
}

/** First-run panel: asks the user their name so the panther can nag them by it. */
export default function NamePrompt({ onDone }: NamePromptProps): JSX.Element {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await window.panther.setUserName(trimmed)
      onDone(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="popover no-drag">
      <div className="popover-head">
        <span>Welcome</span>
      </div>
      <p className="name-intro">
        I&apos;m your panther. I&apos;ll track your tasks and nag you out loud when they&apos;re
        overdue. What should I call you?
      </p>
      <input
        className="task-input"
        autoFocus
        value={name}
        maxLength={60}
        placeholder="Your name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
        }}
      />
      <button className="add-btn" onClick={() => void save()} disabled={saving || !name.trim()}>
        Let&apos;s go
      </button>
    </div>
  )
}
