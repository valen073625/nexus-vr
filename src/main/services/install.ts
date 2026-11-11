import axios from 'axios'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import extract from 'extract-zip'
import log from 'electron-log'
import { VersionsService, LibraryEntry } from './versions'

export type ProgressCallback = (info: {
  stage: string
  current: number
  total: number
  message: string
}) => void

interface LibraryArtifact {
  path: string
  sha1: string
  size: number
  url: string
}

export class InstallService {
  private versions = new VersionsService()
  private inFlight = new Map<string, Promise<void>>()

  private getOsName(): string {
    if (process.platform === 'win32') return 'windows'
    if (process.platform === 'darwin') return 'osx'
    return 'linux'
  }

  private rulesAllow(rules?: LibraryEntry['rules']): boolean {
    if (!rules || rules.length === 0) return true
    let allowed = false
    for (const rule of rules) {
      let match = true
      if (rule.os?.name && rule.os.name !== this.getOsName()) match = false
      if (match) allowed = rule.action === 'allow'
    }
    return allowed
  }

  private async ensureDir(dir: string) {
    await fs.promises.mkdir(dir, { recursive: true })
  }

  private async fileMatchesSha1(filePath: string, sha1?: string): Promise<boolean> {
    if (!sha1 || !fs.existsSync(filePath)) return false
    try {
      const hash = crypto.createHash('sha1')
      const data = await fs.promises.readFile(filePath)
      hash.update(data)
      return hash.digest('hex') === sha1
    } catch {
      return false
    }
  }

  private async downloadFile(
    url: string,
    dest: string,
    sha1?: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    const key = path.normalize(dest)
    const existing = this.inFlight.get(key)
    if (existing) {
      await existing
      return
    }

    const task = this.downloadFileInner(url, dest, sha1, onProgress).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, task)
    await task
  }

  private async downloadFileInner(
    url: string,
    dest: string,
    sha1?: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    if (await this.fileMatchesSha1(dest, sha1)) return
    if (!sha1 && fs.existsSync(dest)) return

    await this.ensureDir(path.dirname(dest))
    const tmp = `${dest}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.part`

    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 120000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 300,
      })

      const total = Number(response.headers['content-length'] || 0)
      let downloaded = 0

      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (onProgress) onProgress(downloaded, total)
      })

      await pipeline(response.data, createWriteStream(tmp))

      if (await this.fileMatchesSha1(dest, sha1)) {
        await fs.promises.unlink(tmp).catch(() => {})
        return
      }

      try {
        if (fs.existsSync(dest)) await fs.promises.unlink(dest)
      } catch {
        // ignore
      }

      try {
        await fs.promises.rename(tmp, dest)
      } catch (err: any) {
        if (await this.fileMatchesSha1(dest, sha1)) {
          await fs.promises.unlink(tmp).catch(() => {})
          return
        }
        try {
          await fs.promises.copyFile(tmp, dest)
          await fs.promises.unlink(tmp).catch(() => {})
        } catch (err2: any) {
          await fs.promises.unlink(tmp).catch(() => {})
          throw new Error(`No se pudo guardar ${path.basename(dest)}: ${err2.message || err.message}`)
        }
      }

      if (sha1 && !(await this.fileMatchesSha1(dest, sha1))) {
        await fs.promises.unlink(dest).catch(() => {})
        throw new Error(`SHA1 mismatch for ${path.basename(dest)}`)
      }
    } catch (err) {
      await fs.promises.unlink(tmp).catch(() => {})
      throw err
    }
  }

  async installVersion(
    versionId: string,
    gameDir: string,
    onProgress?: ProgressCallback
  ): Promise<{ versionJsonPath: string; versionJson: any }> {
    const report = (stage: string, current: number, total: number, message: string) => {
      onProgress?.({ stage, current, total, message })
    }

    report('manifest', 0, 1, `Obteniendo info de ${versionId}...`)
    const versionJson = await this.versions.getVersionInfo(versionId)

    const versionsDir = path.join(gameDir, 'versions', versionId)
    await this.ensureDir(versionsDir)
    const versionJsonPath = path.join(versionsDir, `${versionId}.json`)
    await fs.promises.writeFile(versionJsonPath, JSON.stringify(versionJson, null, 2), 'utf-8')

    const client = versionJson.downloads?.client
    if (!client?.url) throw new Error('Version JSON sin client download')
    const clientJar = path.join(versionsDir, `${versionId}.jar`)
    report('client', 0, 1, 'Descargando client.jar...')
    await this.downloadFile(client.url, clientJar, client.sha1, (d, t) => {
      report('client', d, t || client.size || 1, 'Descargando client.jar...')
    })

    const libraries: LibraryEntry[] = versionJson.libraries || []
    const libDir = path.join(gameDir, 'libraries')
    const nativesDir = path.join(versionsDir, 'natives')
    await this.ensureDir(nativesDir)

    const libsToDownload: Array<{ artifact: LibraryArtifact; isNative: boolean }> = []
    const seenLibPaths = new Set<string>()
    for (const lib of libraries) {
      if (!this.rulesAllow(lib.rules)) continue

      if (lib.downloads?.artifact) {
        const p = lib.downloads.artifact.path
        if (!seenLibPaths.has(p)) {
          seenLibPaths.add(p)
          libsToDownload.push({ artifact: lib.downloads.artifact, isNative: false })
        }
      }

      const classifierKey = lib.natives?.[this.getOsName()]
      if (classifierKey && lib.downloads?.classifiers) {
        const key = classifierKey.replace('${arch}', process.arch === 'x64' ? '64' : '32')
        const nativeArt = lib.downloads.classifiers[key] || lib.downloads.classifiers[classifierKey]
        if (nativeArt && !seenLibPaths.has(nativeArt.path)) {
          seenLibPaths.add(nativeArt.path)
          libsToDownload.push({ artifact: nativeArt, isNative: true })
        }
      }
    }

    let libDone = 0
    for (const item of libsToDownload) {
      const dest = path.join(libDir, item.artifact.path)
      report(
        'libraries',
        libDone,
        libsToDownload.length,
        `Biblioteca: ${path.basename(item.artifact.path)}`
      )
      await this.downloadFile(item.artifact.url, dest, item.artifact.sha1)

      if (item.isNative) {
        try {
          await extract(dest, { dir: nativesDir })
        } catch (err: any) {
          log.warn('Native extract warning:', err.message)
        }
      }
      libDone++
    }
    report('libraries', libsToDownload.length, libsToDownload.length, 'Bibliotecas listas')

    const assetIndex = versionJson.assetIndex
    if (assetIndex?.url) {
      const indexesDir = path.join(gameDir, 'assets', 'indexes')
      await this.ensureDir(indexesDir)
      const indexPath = path.join(indexesDir, `${assetIndex.id}.json`)
      report('assets', 0, 1, 'Descargando indice de assets...')
      await this.downloadFile(assetIndex.url, indexPath, assetIndex.sha1)

      const indexData = JSON.parse(await fs.promises.readFile(indexPath, 'utf-8'))
      const objects: Record<string, { hash: string; size: number }> = indexData.objects || {}

      const uniqueByHash = new Map<string, { hash: string; size: number }>()
      for (const obj of Object.values(objects)) {
        if (obj?.hash) uniqueByHash.set(obj.hash, obj)
      }
      const uniqueAssets = Array.from(uniqueByHash.values())

      const objectsDir = path.join(gameDir, 'assets', 'objects')
      await this.ensureDir(objectsDir)

      let assetDone = 0
      const totalAssets = uniqueAssets.length
      const concurrency = 6

      for (let i = 0; i < uniqueAssets.length; i += concurrency) {
        const batch = uniqueAssets.slice(i, i + concurrency)
        await Promise.all(
          batch.map(async (obj) => {
            const hash = obj.hash
            const sub = hash.substring(0, 2)
            const dest = path.join(objectsDir, sub, hash)
            const url = `https://resources.download.minecraft.net/${sub}/${hash}`
            await this.downloadFile(url, dest, hash)
          })
        )
        assetDone += batch.length
        report('assets', assetDone, totalAssets, `Assets ${assetDone}/${totalAssets}`)
      }
    }

    report('done', 1, 1, 'Instalacion completa')
    return { versionJsonPath, versionJson }
  }
}
