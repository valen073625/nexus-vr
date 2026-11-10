import { ipcMain, app, dialog } from 'electron'
import { SettingsService } from '../services/settings'
import log from 'electron-log'

const settingsService = new SettingsService()

export function setupSettingsHandlers() {
  ipcMain.handle('settings:get', () => {
    return settingsService.getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings: any) => {
    try {
      settingsService.saveSettings(settings)
      return { success: true }
    } catch (err: any) {
      log.error('Settings save error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('settings:selectDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Seleccionar directorio de Minecraft',
      defaultPath: app.getPath('appData'),
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, path: result.filePaths[0] }
  })

  ipcMain.handle('settings:selectJava', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Seleccionar ejecutable de Java',
      filters: [
        { name: 'Java', extensions: ['exe', ''] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, path: result.filePaths[0] }
  })

  ipcMain.handle('settings:getDefaultDir', () => {
    return settingsService.getDefaultGameDir()
  })
}
