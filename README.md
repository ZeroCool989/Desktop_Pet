# Panther 🐈‍⬛

A black panther that lives on your desktop in a small transparent,
always-on-top window, tracks your to-do list, and nags you **out loud, by
name** when tasks are overdue.

> "Alex, you still have 'finish the client deck' and 'gym' to finish."

On first launch the panther asks for your name and remembers it — that's the
name it uses when it talks to you. You can change it later in the settings
file (see below).

## Stack

Electron + electron-vite + React + TypeScript (strict) · React Three Fiber +
drei · better-sqlite3 · chrono-node · Zod-validated IPC · OS-native TTS
(macOS `say`, Windows `SpeechSynthesizer`).

## Setup

```bash
npm install          # also rebuilds better-sqlite3 for Electron + generates icons
# drop your Meshy .glb export(s) into assets/ (optional — placeholder renders without them)
npm run dev
```

Multiple GLBs sharing one rig merge their animation clips (e.g. Meshy's
separate Walking and Running exports). The panther also **prowls**: every
4–9 minutes it strolls its window to a new spot on your screen, playing the
walk clip and facing the direction of travel. Nags play the run clip.

## Everyday use

- **Click the panther** (center of its body) → task popover. The **edges** of
  the window drag it around; position is remembered.
- **Cmd/Ctrl+Shift+P** → toggle the popover from anywhere.
- Type one task per line — chrono-node parses the dates:
  ```
  finish client deck by 15:00
  call dentist tomorrow 9am
  gym tonight
  ```
  Lines with no time default to **today 18:00**.
- Every 10 minutes the scheduler checks for overdue tasks and the panther
  speaks up (first friendly, then firmer, then sarcastic; never more than
  once per task per 45 min). Finishing everything overdue earns you one
  short praise line.
- **Tray menu**: Open tasks · Mute 1 hour · Mute today · Quit.
- **Quiet hours** default to 22:00–08:00. Quiet hours and your name are
  stored in `~/Library/Application Support/panther/settings.json` (macOS) or
  `%APPDATA%/panther/settings.json` (Windows):
  ```json
  { "quietStart": 22, "quietEnd": 8, "userName": "Alex" }
  ```

## Voice

Native TTS by default. To swap engines later set `PANTHER_TTS_PROVIDER`
(`native` | `elevenlabs` | `openai`) — cloud providers are stubbed in
`src/main/tts.ts` and currently fall back to native.

## Scripts

| command             | what it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | run with HMR (electron-vite)                  |
| `npm test`          | Vitest: task-line parser + nag cooldown logic |
| `npm run typecheck` | strict TS across main/preload/renderer        |
| `npm run build`     | bundle main/preload/renderer to `out/`        |
| `npm run dist:mac`  | build + package `.dmg`/`.zip` (run on macOS)  |
| `npm run dist:win`  | build + package NSIS installer (run on Win)   |

Native modules (better-sqlite3) make cross-compiling installers unreliable —
build each platform's installer on that platform.

## Architecture

```
src/
  main/       Electron main: window, tray, scheduler, SQLite, TTS, zod-validated IPC
  preload/    contextBridge API (contextIsolation on, no nodeIntegration)
  renderer/   React + R3F scene (30fps cap, frameloop="demand"), popover UI
  shared/     pure logic: task-line parser, nag policy (cooldown/quiet hours/escalation)
tests/        Vitest for parser + nag policy
assets/       panther.glb (yours) + generated tray icons
```

Rendering idles at ~12fps on a demand frameloop and bumps to 30fps while
talking or when the popover is open, so CPU/GPU usage stays near zero.
