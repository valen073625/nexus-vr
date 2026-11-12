import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export interface AppSettings {
  gameDir: string
  javaPath: string
  maxRam: number
  minRam: number
  jvmArgs: string
  selectedVersion: string
  showSnapshots: boolean
  theme: 'dark' | 'darker'
  closeOnLaunch: boolean
  /** true = el launcher NO se cierra al abrir Minecraft */
  keepLauncherOpen: boolean
  showHud: boolean
  curseforgeApiKey: string
  optimize?: any
}

export class SettingsService {
  private settingsPath: string

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json')
  }

  getDefaultGameDir(): string {
    if (process.platform === 'win32') {
      return path.join(app.getPath('appData'), '.nexus-launcher')
    } else if (process.platform === 'darwin') {
      return path.join(app.getPath('home'), 'Library', 'Application Support', 'nexus-launcher')
    } else {
      return path.join(app.getPath('home'), '.nexus-launcher')
    }
  }

  getDefaults(): AppSettings {
    return {
      gameDir: this.getDefaultGameDir(),
      javaPath: '',
      maxRam: 2048,
      minRam: 512,
      jvmArgs: '',
      selectedVersion: '',
      showSnapshots: false,
      theme: 'dark',
      closeOnLaunch: false,
      keepLauncherOpen: false,
      showHud: false,
      curseforgeApiKey: '',
    }
  }

  getSettings(): AppSettings {
    if (!fs.existsSync(this.settingsPath)) {
      return this.getDefaults()
    }
    try {
      const saved = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'))
      return { ...this.getDefaults(), ...saved }
    } catch {
      return this.getDefaults()
    }
  }

  saveSettings(settings: Partial<AppSettings>): void {
    const current = this.getSettings()
    const merged = { ...current, ...settings }
    fs.writeFileSync(this.settingsPath, JSON.stringify(merged, null, 2), 'utf-8')
  }
}
