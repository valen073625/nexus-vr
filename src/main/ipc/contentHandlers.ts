import { ipcMain, BrowserWindow, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { ContentService, type ContentSource, type ContentType } from '../services/content'
import { InstancesService } from '../services/instances'
import { SettingsService } from '../services/settings'
import type { LoaderType } from '../services/loaders'

const OPEN_HOSTS = ['modrinth.com', 'www.curseforge.com', 'curseforge.com', 'console.curseforge.com']

export function setupContentHandlers(mainWindow: BrowserWindow) {
  const settings = new SettingsService()
  const instances = new InstancesService()
  const content = new ContentService(() => settings.getSettings().curseforgeApiKey)

  function targetFor(mc: string, loader: LoaderType, instanceId?: string): string {
    const gameDir = settings.getSettings().gameDir
    if (instanceId) {
      if (!instances.get(instanceId)) throw new Error('Esa instancia ya no existe.')
      return instances.dir(gameDir, instanceId)
    }
    const inst = instances.ensure(mc, loader)
    return instances.dir(gameDir, inst?.id)
  }

  ipcMain.handle('content:search', async (_e, o: {
    source: ContentSource; type: ContentType; query: string; mcVersion?: string; loader?: LoaderType; page?: number
  }) => {
    try { return { success: true, ...(await content.search(o)) } }
    catch (err: any) {
      const status = err.response?.status
      const msg = status === 403 && o.source === 'curseforge'
        ? 'CurseForge rechazó la clave de API. Revisala en Configuración.'
        : err.message
      return { success: false, error: msg, items: [], total: 0 }
    }
  })

  ipcMain.handle('content:install', async (_e, o: {
    source: ContentSource; type: ContentType; projectId: string
    mcVersion: string; loader: LoaderType; instanceId?: string
  }) => {
    const progress = (msg: string, cur?: number, tot?: number) =>
      mainWindow.webContents.send('content:progress', { msg, current: cur || 0, total: tot || 0 })
    try {
      const gameDir = settings.getSettings().gameDir
      if (o.type !== 'modpack') {
        const targetDir = targetFor(o.mcVersion, o.loader, o.instanceId)
        return await content.install({ ...o, targetDir }, progress)
      }
      // Modpack: se baja a una carpeta temporal y luego se convierte en instancia
      const tmpDir = path.join(gameDir, 'instances', `.incoming-${Date.now()}`)
      fs.mkdirSync(tmpDir, { recursive: true })
      const result = await content.install({ ...o, targetDir: tmpDir }, progress)
      if (!result.success || !result.modpack) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        return result
      }
      const inst = instances.createModpack(result.modpack.name, result.modpack.mcVersion, result.modpack.loader)
      const finalDir = instances.dir(gameDir, inst.id)
      fs.rmSync(finalDir, { recursive: true, force: true })
      fs.renameSync(tmpDir, finalDir)
      return { ...result, instance: inst }
    } catch (err: any) {
      log.error('content:install', err)
      return { success: false, installed: [], skipped: [], message: err.message }
    }
  })

  ipcMain.handle('content:installed', (_e, mc: string, loader: LoaderType, instanceId?: string) => {
    try { return { success: true, ...content.listInstalled(targetFor(mc, loader, instanceId)) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('content:remove', (_e, o: { mcVersion: string; loader: LoaderType; instanceId?: string; kind: 'mods' | 'resourcepacks' | 'shaders'; name: string }) => {
    try { content.remove(targetFor(o.mcVersion, o.loader, o.instanceId), o.kind, o.name); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('app:openExternal', (_e, url: string) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'https:' && OPEN_HOSTS.includes(u.hostname)) { shell.openExternal(url); return true }
    } catch { /* ignore */ }
    return false
  })
}
