import { ipcMain, BrowserWindow } from 'electron'
import { LauncherService } from '../services/launcher'
import { DownloaderService } from '../services/downloader'
import { JavaService } from '../services/java'
import log from 'electron-log'

export function setupLauncherHandlers(mainWindow: BrowserWindow) {
  const launcherService = new LauncherService()
  const downloaderService = new DownloaderService()
  const javaService = new JavaService()

  ipcMain.handle('launcher:launch', async (_event, options: {
    versionId: string
    profileType: 'microsoft' | 'offline'
    profileData: { username: string; uuid: string; accessToken?: string }
    settings: { gameDir: string; javaPath: string; maxRam: number; minRam: number; jvmArgs: string }
  }) => {
    try {
      const requiredMajor = javaService.getRequiredJavaVersion(options.versionId)
      log.info(`[Launcher] Versión Minecraft: ${options.versionId} → requiere Java ${requiredMajor}`)

      // 1. Buscar Java con la versión exacta requerida
      let javaPath = await javaService.ensureJava(options.versionId, options.settings.javaPath)

      if (!javaPath) {
        // No tenemos el Java requerido → descargarlo
        log.info(`[Launcher] Java ${requiredMajor} no encontrado, descargando...`)
        mainWindow.webContents.send('download:progress', {
          phase: 'java',
          current: 0,
          total: 100,
          currentFile: `Java ${requiredMajor} Runtime`,
          speed: 0,
          downloaded: 0,
          totalBytes: 0,
        })

        javaPath = await javaService.downloadJava(requiredMajor, (p) => {
          mainWindow.webContents.send('download:progress', p)
        })

        if (!javaPath) {
          return { success: false, error: `No se pudo instalar Java ${requiredMajor}. Revisa tu conexión a internet.` }
        }

        log.info(`[Launcher] Java ${requiredMajor} instalado en: ${javaPath}`)
      } else {
        log.info(`[Launcher] Java ${requiredMajor} disponible en: ${javaPath}`)
      }

      options.settings.javaPath = javaPath

      // 2. Descargar archivos de la versión de Minecraft si no están
      await downloaderService.ensureVersion(
        options.versionId,
        options.settings.gameDir,
        (progress) => { mainWindow.webContents.send('download:progress', progress) }
      )

      // 3. Lanzar Minecraft
      await launcherService.launch({
        versionId: options.versionId,
        gameDir: options.settings.gameDir,
        javaPath: options.settings.javaPath,
        maxRam: options.settings.maxRam,
        minRam: options.settings.minRam,
        jvmArgs: options.settings.jvmArgs,
        profileType: options.profileType,
        profileData: options.profileData,
      })

      return { success: true }
    } catch (err: any) {
      log.error('[Launcher] Error al lanzar:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('java:detect', async (_event, versionId: string) => {
    try {
      const javaPath = await javaService.detectJava(versionId)
      return { success: true, javaPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('java:download', async (_event, majorVersion: number) => {
    try {
      const javaPath = await javaService.downloadJava(majorVersion, (progress) => {
        mainWindow.webContents.send('download:progress', progress)
      })
      return { success: true, javaPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
