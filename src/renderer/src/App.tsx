import { useEffect, useRef, useState } from 'react'
import type { WalkEvent } from '@shared/types'
import PantherScene from './Panther'
import Popover from './Popover'
import NamePrompt from './NamePrompt'

export default function App(): JSX.Element {
  const [popover, setPopover] = useState(false)
  const [needsName, setNeedsName] = useState(false)
  const [talking, setTalking] = useState(false)
  const [walk, setWalk] = useState<WalkEvent>({ walking: false, dir: 1 })
  const [bubble, setBubble] = useState<string | null>(null)
  const talkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)

  // First run: no name saved yet, so ask before anything else.
  useEffect(() => {
    void window.panther.getUserName().then((name) => setNeedsName(!name))
  }, [])

  useEffect(() => {
    const offNag = window.panther.onNag(({ text, durationMs }) => {
      if (talkTimer.current) clearTimeout(talkTimer.current)
      setTalking(true)
      setBubble(text)
      talkTimer.current = setTimeout(() => {
        setTalking(false)
        setBubble(null)
      }, durationMs)
    })
    const offToggle = window.panther.onTogglePopover(() => setPopover((p) => !p))
    const offWalk = window.panther.onWalk(setWalk)
    return () => {
      offNag()
      offToggle()
      offWalk()
      if (talkTimer.current) clearTimeout(talkTimer.current)
    }
  }, [])

  // Main resizes the window to make room for the popover (or the first-run prompt).
  useEffect(() => {
    void window.panther.setPopoverOpen(popover || needsName)
  }, [popover, needsName])

  const onNamed = (name: string): void => {
    setNeedsName(false)
    if (talkTimer.current) clearTimeout(talkTimer.current)
    setTalking(true)
    setBubble(`Nice to meet you, ${name}. Click me anytime to add tasks.`)
    talkTimer.current = setTimeout(() => {
      setTalking(false)
      setBubble(null)
    }, 5000)
  }

  // Grab-anywhere dragging with pointer capture; a press that never moves
  // more than 4px counts as a click and toggles the popover instead.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.screenX, startY: e.screenY, moved: false }
    window.panther.beginDrag()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.screenX - d.startX
    const dy = e.screenY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true
    if (d.moved) window.panther.dragTo(dx, dy)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    window.panther.endDrag()
    if (!d.moved) setPopover((p) => !p)
  }

  return (
    <div className="root">
      <div
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <PantherScene talking={talking} walk={walk} active={talking || popover || walk.walking} />
        {bubble && <div className="bubble">{bubble}</div>}
      </div>
      {needsName ? <NamePrompt onDone={onNamed} /> : popover && <Popover onClose={() => setPopover(false)} />}
    </div>
  )
}
