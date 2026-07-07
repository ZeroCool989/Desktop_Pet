import { execFile, spawn } from 'child_process'

/**
 * speak(text) — OS-native TTS behind an abstraction.
 * Set PANTHER_TTS_PROVIDER=elevenlabs|openai later to swap engines
 * (stubs fall back to native until implemented).
 */

/**
 * Defense in depth: text never touches a shell (execFile arg array on macOS,
 * stdin on Windows), but strip control chars and cap length anyway.
 */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

function speakMac(text: string): Promise<void> {
  return new Promise((resolve) => {
    // execFile with an args array — no shell, no interpolation.
    const child = execFile('say', ['-r', '175', text], (err) => {
      if (err) console.error('say failed:', err.message)
      resolve()
    })
    child.on('error', () => resolve())
  })
}

function speakWindows(text: string): Promise<void> {
  return new Promise((resolve) => {
    // Text is piped via stdin, never embedded in the command string,
    // so it cannot break out into PowerShell syntax.
    const script =
      'Add-Type -AssemblyName System.Speech; ' +
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      '$s.Rate = 1; ' +
      '$t = [Console]::In.ReadToEnd(); ' +
      'if ($t) { $s.Speak($t) }'
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore']
    })
    child.on('error', (err) => {
      console.error('powershell TTS failed:', err.message)
      resolve()
    })
    child.on('close', () => resolve())
    child.stdin.write(text, 'utf8')
    child.stdin.end()
  })
}

async function speakNative(text: string): Promise<void> {
  if (process.platform === 'darwin') return speakMac(text)
  if (process.platform === 'win32') return speakWindows(text)
  console.warn('No native TTS on this platform; skipping:', text)
}

async function speakWithProvider(text: string): Promise<void> {
  const provider = process.env.PANTHER_TTS_PROVIDER ?? 'native'
  switch (provider) {
    case 'native':
      return speakNative(text)
    case 'elevenlabs':
    case 'openai':
      // TODO: implement cloud TTS (fetch audio, play via renderer). Falls back for now.
      console.warn(`TTS provider "${provider}" not implemented yet — using native TTS.`)
      return speakNative(text)
    default:
      console.warn(`Unknown TTS provider "${provider}" — using native TTS.`)
      return speakNative(text)
  }
}

// Serialize speech so overlapping nags don't talk over each other.
let queue: Promise<void> = Promise.resolve()

export function speak(text: string): Promise<void> {
  const clean = sanitizeForSpeech(text)
  if (!clean) return Promise.resolve()
  queue = queue.then(() => speakWithProvider(clean)).catch(() => undefined)
  return queue
}
