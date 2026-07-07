import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { z } from 'zod'

const SettingsSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  quietStart: z.number().int().min(0).max(23).default(22),
  quietEnd: z.number().int().min(0).max(23).default(8),
  userName: z.string().min(1).max(60).default('Almir'),
  /** Occasional tough-love pep talks while tasks are open. */
  motivation: z.boolean().default(true)
})

export type Settings = z.infer<typeof SettingsSchema>

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cached: Settings | null = null

export function loadSettings(): Settings {
  if (cached) return cached
  let raw: unknown = {}
  try {
    raw = JSON.parse(readFileSync(settingsPath(), 'utf8'))
  } catch {
    // first run or corrupt file — fall back to defaults
  }
  const parsed = SettingsSchema.safeParse(raw)
  cached = parsed.success ? parsed.data : SettingsSchema.parse({})
  return cached
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = SettingsSchema.parse({ ...loadSettings(), ...patch })
  cached = next
  try {
    const p = settingsPath()
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(next, null, 2))
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
  return next
}
