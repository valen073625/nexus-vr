import { ipcMain } from 'electron'
import { VersionsService } from '../services/versions'
import log from 'electron-log'
import fs from 'fs'
import path from 'path'
import { SettingsService } from '../services/settings'

const versionsService = new VersionsService()

export function setupVersionHandlers() {
  ipcMain.handle('versions:getManifest', async () => {
    try {
      const manifest = await versionsService.getVersionManifest()
      return { success: true, manifest }
    } catch (err: any) {
      log.error('Get manifest error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('versions:getPlayable', async () => {
    try {
      const data = await versionsService.getPlayableVersions()
      return { success: true, ...data }
    } catch (err: any) {
      log.error('Get playable versions error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('versions:getVersionInfo', async (_event, versionId: string) => {
    try {
      const info = await versionsService.getVersionInfo(versionId)
      return { success: true, info }
    } catch (err: any) {
      log.error('Get version info error:', err)
      return { success: false, error: err.message }
    }
  })

  // Versiones ya descargadas en el disco (vanilla y con loader)
  ipcMain.handle('versions:installed', () => {
    const vanilla: string[] = []
    const loaders: { id: string; mc: string; loader: string }[] = []
    try {
      const root = path.join(new SettingsService().getSettings().gameDir, 'versions')
      for (const d of fs.readdirSync(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const json = path.join(root, d.name, `${d.name}.json`)
        if (!fs.existsSync(json)) continue
        let info: any
        try { info = JSON.parse(fs.readFileSync(json, 'utf8')) } catch { continue }
        if (info.inheritsFrom) {
          const n = d.name.toLowerCase()
          const loader = n.includes('neoforge') ? 'neoforge' : n.includes('forge') ? 'forge' : n.includes('quilt') ? 'quilt' : n.includes('fabric') ? 'fabric' : ''
          if (loader) loaders.push({ id: d.name, mc: info.inheritsFrom, loader })
        } else if (fs.existsSync(path.join(root, d.name, `${d.name}.jar`))) {
          vanilla.push(d.name)
        }
      }
    } catch { /* carpeta aun no existe */ }
    return { vanilla, loaders }
  })
}
