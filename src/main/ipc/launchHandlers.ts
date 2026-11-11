import { ipcMain, BrowserWindow } from 'electron'
import log from 'electron-log'
import { launchService } from '../services/launch'

export function setupLaunchHandlers() {
  ipcMain.handle(
    'launch:game',
    async (event, payload: { versionId: string; username?: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender)

      const onProgress = (info: {
        stage: string
        current: number
        total: number
        message: string
      }) => {
        win?.webContents.send('launch:progress', info)
      }

      try {
        const result = await launchService.launch({
          versionId: payload.versionId,
          username: payload.username,
          onProgress,
        })
        return result
      } catch (err: any) {
        log.error('launch:game error', err)
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('launch:isRunning', () => {
    return { running: launchService.isGameRunning() }
  })
}
