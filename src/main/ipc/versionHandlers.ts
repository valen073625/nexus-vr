import { ipcMain } from 'electron'
import { VersionsService } from '../services/versions'
import log from 'electron-log'

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

  ipcMain.handle('versions:getVersionInfo', async (_event, versionId: string) => {
    try {
      const info = await versionsService.getVersionInfo(versionId)
      return { success: true, info }
    } catch (err: any) {
      log.error('Get version info error:', err)
      return { success: false, error: err.message }
    }
  })
}
