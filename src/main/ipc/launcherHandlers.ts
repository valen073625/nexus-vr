import { ipcMain, BrowserWindow, app } from 'electron'
import { LauncherService, type OptimizeOptions } from '../services/launcher'
import { DownloaderService } from '../services/downloader'
import { JavaService } from '../services/java'
import { JavaRuntimesService } from '../services/javaRuntimes'
import { VersionsService } from '../services/versions'
import { LoaderService, type LoaderType } from '../services/loaders'
import { InstancesService } from '../services/instances'
import { ContentService } from '../services/content'
import { SettingsService } from '../services/settings'
import log from 'electron-log'

export function sendProgress(win: BrowserWindow, phase: string, msg: string, current = 0, total = 1) {
  win.webContents.send('download:progress', {
    phase, current, total, currentFile: msg, speed: 0, downloaded: current, totalBytes: total,
  })
}

export function setupLauncherHandlers(mainWindow: BrowserWindow) {
  const launcherService = new LauncherService()
  const downloaderService = new DownloaderService()
  const javaService = new JavaService()
  const runtimes = new JavaRuntimesService()
  const versions = new VersionsService()
  const loaders = new LoaderService()
  const instances = new InstancesService()
  const settingsSvc = new SettingsService()
  const content = new ContentService(() => settingsSvc.getSettings().curseforgeApiKey)

  ipcMain.handle('launcher:launch', async (_event, options: {
    versionId: string
    loader?: LoaderType
    instanceId?: string
    profileType: 'microsoft' | 'offline'
    profileData: { username: string; uuid: string; accessToken?: string }
    settings: { gameDir: string; javaPath: string; maxRam: number; minRam: number; jvmArgs: string }
    optimize?: OptimizeOptions
    showHud?: boolean
  }) => {
    const notices: string[] = []
    try {
      const gameDir = options.settings.gameDir
      let mc = options.versionId
      let loader: LoaderType = options.loader ?? 'vanilla'
      let instanceId: string | null = null

      if (options.instanceId) {
        const inst = instances.get(options.instanceId)
        if (!inst) return { success: false, error: 'Esa instancia ya no existe.' }
        mc = inst.mcVersion
        loader = inst.loader
        instanceId = inst.id
      } else {
        instanceId = instances.ensure(mc, loader)?.id ?? null
      }
      const instanceDir = instanceId ? instances.dir(gameDir, instanceId) : undefined
      const progress = (p: any) => mainWindow.webContents.send('download:progress', p)

      // 1) Java correcto para esa version (lo que dice Mojang); solo se baja si falta
      const info = await versions.getVersionInfo(mc, gameDir)
      const required = javaService.requiredJavaMajor(mc, info.javaVersion?.majorVersion)
      const resolved = await runtimes.resolveForMinecraft(
        mc, options.settings.javaPath,
        (msg, cur, tot) => sendProgress(mainWindow, 'java', msg, cur || 0, tot || 1),
        info.javaVersion?.majorVersion
      )
      if (!resolved.javaPath) return { success: false, error: `No se pudo instalar Java ${required}.` }
      const javaPath = resolved.javaPath

      // 2) Minecraft base
      await downloaderService.ensureVersion(mc, gameDir, progress, loader === 'vanilla')

      // 3) Loader
      let launchId = mc
      if (loader !== 'vanilla') {
        launchId = await loaders.install(loader, mc, gameDir, javaPath, progress)
        await downloaderService.ensureVersion(launchId, gameDir, progress, true)
      }

      // 4) Mods administrados: Optimizar y FPS/ms dentro del juego
      if (instanceDir && loader !== 'vanilla') {
        const cb = (msg: string, cur?: number, tot?: number) => sendProgress(mainWindow, 'mods', msg, cur || 0, tot || 1)
        const wantOpt = !!options.optimize?.enabled
        const wantHud = !!options.showHud
        const opt = await content.syncManaged('optimize', wantOpt, mc, loader, instanceDir, cb)
        const hud = await content.syncManaged('hud', wantHud, mc, loader, instanceDir, cb)
        if (opt.missing.length) notices.push(`Optimización: no hay build de ${opt.missing.join(', ')} para ${mc} con ${loader}.`)
        if (wantHud && hud.missing.length) notices.push(`El contador de FPS/ms no tiene versión para ${mc} con ${loader}. Probá otra versión de Minecraft.`)
      } else if (options.showHud || options.optimize?.enabled) {
        notices.push('Para FPS/ms y Optimizar dentro de Minecraft elegí Fabric (o Forge/NeoForge/Quilt).')
      }

      // 5) Lanzar. La RAM del usuario se aplica al final y gana sobre otros -Xmx.
      await launcherService.launch({
        versionId: launchId,
        gameDir,
        instanceDir,
        javaPath,
        maxRam: Number(options.settings.maxRam),
        minRam: Number(options.settings.minRam),
        jvmArgs: options.settings.jvmArgs,
        profileType: options.profileType,
        profileData: options.profileData,
        optimize: options.optimize,
      })

      // Si hay avisos que leer, el launcher queda abierto para que los veas.
      if (!settingsSvc.getSettings().keepLauncherOpen && notices.length === 0) setTimeout(() => app.quit(), 600)
      return { success: true, notices }
    } catch (err: any) {
      log.error('[Launcher] Error al lanzar:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('loaders:availability', async (_e, mc: string) => {
    try { return { success: true, availability: await loaders.availability(mc) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('instances:list', () => instances.list())
  ipcMain.handle('instances:remove', (_e, id: string) => {
    try { instances.remove(settingsSvc.getSettings().gameDir, id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
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
        sendProgress(mainWindow, 'java', msg, current || 0, total || 1)
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
