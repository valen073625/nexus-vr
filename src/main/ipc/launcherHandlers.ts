import { ipcMain, BrowserWindow } from 'electron'
import { LauncherService, type OptimizeOptions } from '../services/launcher'
import { DownloaderService } from '../services/downloader'
import { JavaService } from '../services/java'
import { JavaRuntimesService } from '../services/javaRuntimes'
import log from 'electron-log'

function sendJavaProgress(mainWindow: BrowserWindow, msg: string, current?: number, total?: number) {
  mainWindow.webContents.send('download:progress', {
    phase: 'java', current: current || 0, total: total || 1, currentFile: msg,
    speed: 0, downloaded: current || 0, totalBytes: total || 0,
  })
}

export function setupLauncherHandlers(mainWindow: BrowserWindow) {
  const launcherService = new LauncherService()
  const downloaderService = new DownloaderService()
  const javaService = new JavaService()
  const runtimes = new JavaRuntimesService()

  ipcMain.handle('launcher:launch', async (_event, options: {
    versionId: string
    profileType: 'microsoft' | 'offline'
    profileData: { username: string; uuid: string; accessToken?: string }
    settings: { gameDir: string; javaPath: string; maxRam: number; minRam: number; jvmArgs: string }
    optimize?: OptimizeOptions
  }) => {
    try {
      const requiredMajor = javaService.requiredJavaMajor(options.versionId)
      const resolved = await runtimes.resolveForMinecraft(
        options.versionId,
        options.settings.javaPath,
        (msg, current, total) => sendJavaProgress(mainWindow, msg, current, total)
      )
      if (!resolved.javaPath) {
        return { success: false, error: `No se pudo instalar Java ${requiredMajor}.` }
      }
      options.settings.javaPath = resolved.javaPath

      await downloaderService.ensureVersion(
        options.versionId,
        options.settings.gameDir,
        (progress) => { mainWindow.webContents.send('download:progress', progress) }
      )

      await launcherService.launch({
        versionId: options.versionId,
        gameDir: options.settings.gameDir,
        javaPath: options.settings.javaPath,
        maxRam: Number(options.settings.maxRam),
        minRam: Number(options.settings.minRam),
        jvmArgs: options.settings.jvmArgs,
        profileType: options.profileType,
        profileData: options.profileData,
        optimize: options.optimize,
      })
      return { success: true }
    } catch (err: any) {
      log.error('[Launcher] Error al lanzar:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('java:detect', async (_event, versionId: string) => {
    try {
      const major = javaService.requiredJavaMajor(versionId || '1.20.1')
      const javaPath = await runtimes.findInstalled(major)
      return { success: true, javaPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('java:download', async (_event, majorVersion: number) => {
    try {
      const javaPath = await runtimes.ensureRuntime(majorVersion, (msg, current, total) => {
        sendJavaProgress(mainWindow, msg, current, total)
      })
      return { success: true, javaPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('java:deleteDownloaded', async () => {
    try {
      const result = runtimes.deleteDownloaded()
      return { success: true, path: result.path }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
