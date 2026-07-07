import { Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type { Prowler } from './prowl'
import type { Scheduler } from './scheduler'

interface TrayDeps {
  scheduler: Scheduler
  prowler: Prowler
  openTasks: () => void
}

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  const name = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  const p = app.isPackaged
    ? join(process.resourcesPath, 'assets', name)
    : join(app.getAppPath(), 'assets', name)
  if (!existsSync(p)) return nativeImage.createEmpty()
  const img = nativeImage.createFromPath(p)
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img
}

export function createTray(deps: TrayDeps): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('Panther — desktop task pet')
  refreshMenu(deps)
}

function refreshMenu(deps: TrayDeps): void {
  if (!tray) return
  const { scheduler } = deps
  const muteItems: Electron.MenuItemConstructorOptions[] = scheduler.muted
    ? [
        {
          label: `Muted until ${new Date(scheduler.mutedUntil).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}`,
          enabled: false
        },
        {
          label: 'Unmute',
          click: () => {
            scheduler.unmute()
            refreshMenu(deps)
          }
        }
      ]
    : [
        {
          label: 'Mute for 1 hour',
          click: () => {
            scheduler.muteFor(60 * 60 * 1000)
            refreshMenu(deps)
          }
        },
        {
          label: 'Mute for today',
          click: () => {
            scheduler.muteToday()
            refreshMenu(deps)
          }
        }
      ]

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open tasks', click: deps.openTasks },
      { label: 'Take a walk', click: () => deps.prowler.prowlNow() },
      { type: 'separator' },
      ...muteItems,
      { type: 'separator' },
      { label: 'Quit Panther', click: () => app.quit() }
    ])
  )
}
