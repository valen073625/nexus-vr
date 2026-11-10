import axios from 'axios'
import log from 'electron-log'

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

export interface VersionManifest {
  latest: {
    release: string
    snapshot: string
  }
  versions: Array<{
    id: string
    type: string
    url: string
    time: string
    releaseTime: string
  }>
}

export class VersionsService {
  private cachedManifest: VersionManifest | null = null
  private cacheTime = 0
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

  async getVersionManifest(): Promise<VersionManifest> {
    const now = Date.now()
    if (this.cachedManifest && now - this.cacheTime < this.CACHE_TTL_MS) {
      return this.cachedManifest
    }

    try {
      const response = await axios.get<VersionManifest>(MANIFEST_URL, {
        timeout: 15000,
      })
      this.cachedManifest = response.data
      this.cacheTime = now
      return response.data
    } catch (err: any) {
      log.error('Failed to fetch version manifest:', err.message)
      // Si hay cache viejo, devolverlo
      if (this.cachedManifest) {
        return this.cachedManifest
      }
      throw new Error(`No se pudo obtener el manifest de versiones: ${err.message}`)
    }
  }

  async getVersionInfo(versionId: string): Promise<any> {
    const manifest = await this.getVersionManifest()
    const version = manifest.versions.find((v) => v.id === versionId)
    if (!version) {
      throw new Error(`Versión no encontrada: ${versionId}`)
    }

    try {
      const response = await axios.get(version.url, { timeout: 15000 })
      return response.data
    } catch (err: any) {
      log.error(`Failed to fetch version info for ${versionId}:`, err.message)
      throw new Error(`No se pudo obtener info de la versión ${versionId}: ${err.message}`)
    }
  }
}
