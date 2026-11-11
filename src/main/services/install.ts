import axios from 'axios'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import extract from 'extract-zip'
import log from 'electron-log'
import { VersionsService } from './versions'

export type ProgressCallback = (info: {
  stage: string
  current: number
  total: number
  message: string
}) => void

interface LibraryRule {
  action: 'allow' | 'disallow'
  os?: { name?: string; version?: string; arch?: string }
}

interface LibraryArtifact {
  path: string
  sha1: string
  size: number
  url: string
}

interface Library {
  name: string
  downloads?: {
    artifact?: LibraryArtifact
    classifiers?: Record<string, LibraryArtifact>
  }
  natives?: Record<string, string>
  rules?: LibraryRule[]
}

export class InstallService {
  private versions = new VersionsService()

  private getOsName(): string {
    if (process.platform === 'win32') return 'windows'
    if (process.platform === 'darwin') return 'osx'
    return 'linux'
  }

  private rulesAllow(rules?: LibraryRule[]): boolean {
    if (!rules || rules.length === 0) return true
    let allowed = false
    for (const rule of rules) {
      let match = true
      if (rule.os?.name && rule.os.name !== this.getOsName()) match = false
      if (rule.os?.arch) {
        const arch = process.arch === 'x64' ? 'x86_64' : process.arch
        if (rule.os.arch !== arch && rule.os.arch !== process.arch) match = false
      }
      if (match) {
        allowed = rule.action === 'allow'
      }
    }
    return allowed
  }

  private async ensureDir(dir: string) {
    await fs.promises.mkdir(dir, { recursive: true })
  }

  private async fileMatchesSha1(filePath: string, sha1?: string): Promise<boolean> {
    if (!sha1 || !fs.existsSync(filePath)) return false
    const hash = crypto.createHash('sha1')
    const data = await fs.promises.readFile(filePath)
    hash.update(data)
    return hash.digest('hex') === sha1
  }

  private async downloadFile(
    url: string,
    dest: string,
    sha1?: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    if (await this.fileMatchesSha1(dest, sha1)) return

    await this.ensureDir(path.dirname(dest))
    const tmp = dest + '.part'

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120000,
      maxRedirects: 5,
    })

    const total = Number(response.headers['content-length'] || 0)
    let downloaded = 0

    response.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      if (onProgress) onProgress(downloaded, total)
    })

    await pipeline(response.data, createWriteStream(tmp))
    await fs.promises.rename(tmp, dest)

    if (sha1 && !(await this.fileMatchesSha1(dest, sha1))) {
      await fs.promises.unlink(dest).catch(() => {})
      throw new Error(`SHA1 mismatch for ${path.basename(dest)}`)
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

    // Client jar
    const client = versionJson.downloads?.client
    if (!client?.url) throw new Error('Version JSON sin client download')
    const clientJar = path.join(versionsDir, `${versionId}.jar`)
    report('client', 0, 1, 'Descargando client.jar...')
    await this.downloadFile(client.url, clientJar, client.sha1, (d, t) => {
      report('client', d, t || client.size || 1, 'Descargando client.jar...')
    })

    // Libraries
    const libraries: Library[] = versionJson.libraries || []
    const libDir = path.join(gameDir, 'libraries')
    const nativesDir = path.join(versionsDir, 'natives')
    await this.ensureDir(nativesDir)

    const libsToDownload: Array<{ artifact: LibraryArtifact; isNative: boolean }> = []
    for (const lib of libraries) {
      if (!this.rulesAllow(lib.rules)) continue

      if (lib.downloads?.artifact) {
        libsToDownload.push({ artifact: lib.downloads.artifact, isNative: false })
      }

      // Natives
      const classifierKey = lib.natives?.[this.getOsName()]
      if (classifierKey && lib.downloads?.classifiers) {
        // Reemplazar ${arch}
        const key = classifierKey.replace('${arch}', process.arch === 'x64' ? '64' : '32')
        const nativeArt = lib.downloads.classifiers[key] || lib.downloads.classifiers[classifierKey]
        if (nativeArt) {
          libsToDownload.push({ artifact: nativeArt, isNative: true })
        }
      }
    }

    let libDone = 0
    for (const item of libsToDownload) {
      const dest = path.join(libDir, item.artifact.path)
      report('libraries', libDone, libsToDownload.length, `Biblioteca: ${path.basename(item.artifact.path)}`)
      await this.downloadFile(item.artifact.url, dest, item.artifact.sha1)

      if (item.isNative) {
        try {
          await extract(dest, {
            dir: nativesDir,
            onEntry: (entry) => {
              // Evitar META-INF basura
              if (entry.fileName.startsWith('META-INF/')) {
                entry.fileName = '' // extract-zip skips empty?
              }
            },
          } as any)
        } catch (err: any) {
          // extract-zip onEntry may not support skip; extract all and ignore META-INF at launch
          log.warn('Native extract warning:', err.message)
          await extract(dest, { dir: nativesDir })
        }
      }
      libDone++
    }
    report('libraries', libsToDownload.length, libsToDownload.length, 'Bibliotecas listas')

    // Assets
    const assetIndex = versionJson.assetIndex
    if (assetIndex?.url) {
      const indexesDir = path.join(gameDir, 'assets', 'indexes')
      await this.ensureDir(indexesDir)
      const indexPath = path.join(indexesDir, `${assetIndex.id}.json`)
      report('assets', 0, 1, 'Descargando índice de assets...')
      await this.downloadFile(assetIndex.url, indexPath, assetIndex.sha1)

      const indexData = JSON.parse(await fs.promises.readFile(indexPath, 'utf-8'))
      const objects: Record<string, { hash: string; size: number }> = indexData.objects || {}
      const entries = Object.entries(objects)
      const objectsDir = path.join(gameDir, 'assets', 'objects')

      let assetDone = 0
      const totalAssets = entries.length
      // Descargar en lotes pequeños para no saturar
      const concurrency = 8
      for (let i = 0; i < entries.length; i += concurrency) {
        const batch = entries.slice(i, i + concurrency)
        await Promise.all(
          batch.map(async ([, obj]) => {
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

    report('done', 1, 1, 'Instalación completa')
    return { versionJsonPath, versionJson }
  }
}
