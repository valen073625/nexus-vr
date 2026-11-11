import { ipcMain } from 'electron'
import { MicrosoftAuthService } from '../services/auth'
import { OfflineService } from '../services/offline'
import log from 'electron-log'

const authService = new MicrosoftAuthService()
const offlineService = new OfflineService()

export function setupAuthHandlers() {
  ipcMain.handle('auth:microsoft:login', async () => {
    try {
      const result = await authService.login()
      return { success: true, profile: result }
    } catch (err: any) {
      log.error('Microsoft login error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:microsoft:logout', async () => {
    try {
      await authService.logout()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:microsoft:refresh', async () => {
    try {
      const result = await authService.refreshToken()
      return { success: true, profile: result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:microsoft:getCurrent', async () => {
    try {
      const profile = await authService.getCurrentProfile()
      return { success: true, profile }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:offline:create', async (_event, username: string) => {
    try {
      const profile = offlineService.createProfile(username)
      return { success: true, profile }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:offline:getAll', async () => {
    try {
      const profiles = offlineService.getAllProfiles()
      return { success: true, profiles }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:offline:delete', async (_event, id: string) => {
    try {
      offlineService.deleteProfile(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
