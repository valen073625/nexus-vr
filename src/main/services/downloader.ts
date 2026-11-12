import axios from 'axios'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import extract from 'extract-zip'
import log from 'electron-log'
import { VersionsService, type VersionInfo, type LibraryEntry, validateUrl, libArtifact } from './versions'

export interface DownloadProgress {
  phase: 'client' | 'libraries' | 'assets' | 'java' | 'loader' | 'mods' | 'done'
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

  async ensureVersion(versionId: string, gameDir: string, onProgress: ProgressCallback, finish = true) {
    const info = await this.vs.getVersionInfo(versionId, gameDir)
    const verDir = path.join(gameDir, 'versions', versionId)
    fs.mkdirSync(verDir, { recursive: true })

    // Guardar JSON de versión (los loaders ya traen el suyo)
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

    // Librerías + natives
    await this.downloadLibs(info, gameDir, onProgress)
    await this.extractNatives(info, gameDir, path.join(verDir, 'natives'))

    // Assets
    await this.downloadAssets(info, gameDir, onProgress)

    if (finish) {
      onProgress({ phase: 'done', current: 1, total: 1, currentFile: '', speed: 0, downloaded: 0, totalBytes: 0 })
    }
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
        const art = libArtifact(lib)
        if (art) {
          const dest = path.join(libsDir, art.path)
          // url vacia = la genera el instalador de Forge/NeoForge
          if (art.url && !this.verify(dest, art.sha1)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            const sha1 = art.sha1 ?? (await this.fetchSha1(art.url))
            await this.downloadWithRetry(art.url, dest, sha1)
          }
        }
        // Natives clásicos (1.8 - 1.18): classifier por sistema operativo
        const nat = this.nativeClassifier(lib)
        if (nat) {
          const dest = path.join(libsDir, nat.path)
          if (!this.verify(dest, nat.sha1)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            await this.downloadWithRetry(nat.url, dest, nat.sha1)
          }
        }
        done++
        onProgress({ phase: 'libraries', current: done, total: libs.length, currentFile: lib.name.split(':')[1] ?? lib.name, speed: 0, downloaded: done, totalBytes: libs.length })
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker))
  }

  /** Los repos Maven publican <archivo>.sha1; si existe lo usamos para verificar. */
  private async fetchSha1(url: string): Promise<string | undefined> {
    try {
      validateUrl(url, true)
      const r = await axios.get(url + '.sha1', { timeout: 15000, responseType: 'text' })
      const h = String(r.data).trim().split(/\s+/)[0]
      return /^[a-f0-9]{40}$/i.test(h) ? h.toLowerCase() : undefined
    } catch { return undefined }
  }

  private nativeClassifier(lib: LibraryEntry): { path: string; url: string; sha1: string } | null {
    if (!lib.natives || !lib.downloads?.classifiers) return null
    const key = lib.natives[this.osName()]
    if (!key) return null
    const real = key.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
    const c = lib.downloads.classifiers[real]
    return c ? { path: c.path, url: c.url, sha1: c.sha1 } : null
  }

  /** Extrae las librerias nativas (.dll) a versions/<id>/natives. Necesario en 1.8 - 1.18. */
  private async extractNatives(info: VersionInfo, gameDir: string, nativesDir: string) {
    const marker = path.join(nativesDir, '.nexus-natives-ok')
    if (fs.existsSync(marker)) return
    fs.mkdirSync(nativesDir, { recursive: true })
    let any = false
    for (const lib of this.filterLibs(info.libraries)) {
      const nat = this.nativeClassifier(lib)
      if (!nat) continue
      const jar = path.join(gameDir, 'libraries', nat.path)
      if (!fs.existsSync(jar)) continue
      await extract(jar, { dir: nativesDir })
      for (const ex of lib.extract?.exclude ?? ['META-INF/']) {
        fs.rmSync(path.join(nativesDir, ex), { recursive: true, force: true })
      }
      any = true
    }
    fs.rmSync(path.join(nativesDir, 'META-INF'), { recursive: true, force: true })
    if (any) log.info('Natives extraidos en', nativesDir)
    fs.writeFileSync(marker, 'ok')
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
        let matches = true
        if (rule.os?.name && rule.os.name !== this.osName()) matches = false
        if (rule.os?.arch) {
          const a = rule.os.arch
          const ok = a === 'x86' ? process.arch === 'ia32' : a === process.arch || (a === 'x86_64' && process.arch === 'x64')
          if (!ok) matches = false
        }
        if (matches) allowed = rule.action === 'allow'
      }
      return allowed
    })
  }

  getLibraryPaths(info: VersionInfo, gameDir: string): string[] {
    const libsDir = path.join(gameDir, 'libraries')
    const out: string[] = []
    for (const lib of this.filterLibs(info.libraries)) {
      const art = libArtifact(lib)
      if (!art) continue
      const p = path.join(libsDir, art.path)
      if (fs.existsSync(p)) out.push(p)
      else log.warn('Falta libreria en el classpath:', p)
    }
    return out
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
    validateUrl(url, true)
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
