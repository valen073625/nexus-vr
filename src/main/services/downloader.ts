import axios from 'axios'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import log from 'electron-log'
import { VersionsService, type VersionInfo, type LibraryEntry, validateUrl } from './versions'

export interface DownloadProgress {
  phase: 'client' | 'libraries' | 'assets' | 'java' | 'done'
  current: number
  total: number
  currentFile: string
  speed: number
  downloaded: number
  totalBytes: number
}

export type ProgressCallback = (p: DownloadProgress) => void

export class DownloaderService {
  private vs = new VersionsService()

  async ensureVersion(versionId: string, gameDir: string, onProgress: ProgressCallback) {
    const info = await this.vs.getVersionInfo(versionId)
    const verDir = path.join(gameDir, 'versions', versionId)
    fs.mkdirSync(verDir, { recursive: true })

    // Guardar JSON de versión
    const jsonPath = path.join(verDir, `${versionId}.json`)
    if (!fs.existsSync(jsonPath)) {
      fs.writeFileSync(jsonPath, JSON.stringify(info, null, 2))
    }

    // Cliente
    const clientJar = path.join(verDir, `${versionId}.jar`)
    if (!this.verify(clientJar, info.downloads.client.sha1)) {
      log.info(`Descargando cliente ${versionId}...`)
      await this.download(info.downloads.client.url, clientJar, info.downloads.client.sha1,
        (dl, total, speed) => onProgress({ phase: 'client', current: dl, total, currentFile: `${versionId}.jar`, speed, downloaded: dl, totalBytes: total })
      )
    }

    // Librerías
    await this.downloadLibs(info, gameDir, onProgress)

    // Assets
    await this.downloadAssets(info, gameDir, onProgress)

    onProgress({ phase: 'done', current: 1, total: 1, currentFile: '', speed: 0, downloaded: 0, totalBytes: 0 })
  }

  private async downloadLibs(info: VersionInfo, gameDir: string, onProgress: ProgressCallback) {
    const libsDir = path.join(gameDir, 'libraries')
    const libs = this.filterLibs(info.libraries)
    let done = 0

    const CONC = 4
    const queue = [...libs]
    const worker = async () => {
      while (queue.length > 0) {
        const lib = queue.shift()!
        if (!lib.downloads.artifact) { done++; continue }
        const { path: p, sha1, url } = lib.downloads.artifact
        const dest = path.join(libsDir, p)
        if (!this.verify(dest, sha1)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          await this.downloadWithRetry(url, dest, sha1)
        }
        done++
        onProgress({ phase: 'libraries', current: done, total: libs.length, currentFile: path.basename(p), speed: 0, downloaded: done, totalBytes: libs.length })
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker))
  }

  private async downloadAssets(info: VersionInfo, gameDir: string, onProgress: ProgressCallback) {
    const assetsDir = path.join(gameDir, 'assets')
    const indexDir = path.join(assetsDir, 'indexes')
    const objDir = path.join(assetsDir, 'objects')
    fs.mkdirSync(indexDir, { recursive: true })
    fs.mkdirSync(objDir, { recursive: true })

    const indexPath = path.join(indexDir, `${info.assetIndex.id}.json`)
    if (!this.verify(indexPath, info.assetIndex.sha1)) {
      validateUrl(info.assetIndex.url)
      await this.downloadWithRetry(info.assetIndex.url, indexPath, info.assetIndex.sha1)
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const objects = Object.entries(index.objects) as [string, { hash: string; size: number }][]
    let done = 0
    const total = objects.length
    const queue = [...objects]
    const CONC = 8

    const worker = async () => {
      while (queue.length > 0) {
        const [name, obj] = queue.shift()!
        const pref = obj.hash.slice(0, 2)
        const dest = path.join(objDir, pref, obj.hash)
        if (!this.verify(dest, obj.hash)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          const url = `https://resources.download.minecraft.net/${pref}/${obj.hash}`
          validateUrl(url)
          await this.downloadWithRetry(url, dest, obj.hash)
        }
        done++
        if (done % 100 === 0 || done === total) {
          onProgress({ phase: 'assets', current: done, total, currentFile: name, speed: 0, downloaded: done, totalBytes: total })
        }
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker))
  }

  filterLibs(libraries: LibraryEntry[]): LibraryEntry[] {
    return libraries.filter(lib => {
      if (!lib.rules) return true
      let allowed = false
      for (const rule of lib.rules) {
        const matches = !rule.os || rule.os.name === this.osName()
        if (matches) allowed = rule.action === 'allow'
      }
      return allowed
    })
  }

  getLibraryPaths(info: VersionInfo, gameDir: string): string[] {
    const libsDir = path.join(gameDir, 'libraries')
    return this.filterLibs(info.libraries)
      .filter(l => l.downloads.artifact)
      .map(l => path.join(libsDir, l.downloads.artifact!.path))
      .filter(p => fs.existsSync(p))
  }

  private osName() {
    if (process.platform === 'win32') return 'windows'
    if (process.platform === 'darwin') return 'osx'
    return 'linux'
  }

  verify(filePath: string, sha1?: string): boolean {
    if (!fs.existsSync(filePath)) return false
    if (!sha1) return true
    try {
      const hash = crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex')
      return hash === sha1
    } catch { return false }
  }

  private async downloadWithRetry(url: string, dest: string, sha1?: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try { await this.download(url, dest, sha1); return }
      catch (err) {
        if (i === retries - 1) throw err
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }

  private async download(
    url: string, dest: string, sha1?: string,
    onProgress?: (dl: number, total: number, speed: number) => void
  ) {
    validateUrl(url)
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      onDownloadProgress: (evt) => {
        if (onProgress && evt.total) onProgress(evt.loaded, evt.total, 0)
      },
    })
    const data = Buffer.from(res.data)
    if (sha1) {
      const actual = crypto.createHash('sha1').update(data).digest('hex')
      if (actual !== sha1) throw new Error(`SHA-1 inválido para ${path.basename(dest)}`)
    }
    fs.writeFileSync(dest, data)
  }
}
