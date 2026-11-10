import { ipcMain } from 'electron'
import { ProfilesService } from '../services/profiles'
import log from 'electron-log'

const profilesService = new ProfilesService()

export function setupProfileHandlers() {
  ipcMain.handle('profiles:getAll', () => {
    return profilesService.getAllProfiles()
  })

  ipcMain.handle('profiles:getActive', () => {
    return profilesService.getActiveProfile()
  })

  ipcMain.handle('profiles:setActive', (_event, id: string) => {
    try {
      profilesService.setActiveProfile(id)
      return { success: true }
    } catch (err: any) {
      log.error('Set active profile error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('profiles:delete', (_event, id: string) => {
    try {
      profilesService.deleteProfile(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
