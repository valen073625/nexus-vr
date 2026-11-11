import { ipcMain, dialog } from 'electron'
import log from 'electron-log'
import { SkinsService } from '../services/skins'

const skinsService = new SkinsService()

export function setupSkinHandlers() {
  ipcMain.handle('skins:list', () => {
    return skinsService.list()
  })

  ipcMain.handle('skins:getActive', () => {
    return skinsService.getActive()
  })

  ipcMain.handle('skins:setActive', (_e, id: string | null) => {
    try {
      skinsService.setActive(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skins:import', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Seleccionar imagen de skin (PNG)',
        properties: ['openFile'],
        filters: [{ name: 'Skin PNG', extensions: ['png'] }],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { success: false, canceled: true }
      }
      const info = skinsService.importFromPath(result.filePaths[0])
      const dataUrl = skinsService.getDataUrl(info.id)
      return { success: true, skin: info, dataUrl }
    } catch (err: any) {
      log.error('Skin import error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skins:delete', (_e, id: string) => {
    try {
      skinsService.delete(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skins:getDataUrl', (_e, id: string) => {
    return skinsService.getDataUrl(id)
  })

  ipcMain.handle('skins:getActiveDataUrl', () => {
    return skinsService.getActiveDataUrl()
  })
}
