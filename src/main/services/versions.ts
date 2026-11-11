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

export interface PlayableVersion {
  id: string
  type: string
  releaseTime: string
}

/** Parsea ids tipo 1.8.9 / 1.20 / 1.21.3. Devuelve null si no es release semántica. */
export function parseReleaseVersion(id: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(id)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)]
}

function cmpVersion(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

const MIN_VERSION: [number, number, number] = [1, 8, 9]

export function isPlayableRelease(id: string): boolean {
  const v = parseReleaseVersion(id)
  if (!v) return false
  return cmpVersion(v, MIN_VERSION) >= 0
}

export class VersionsService {
  private cachedManifest: VersionManifest | null = null
  private cacheTime = 0
  private readonly CACHE_TTL_MS = 5 * 60 * 1000

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
      if (this.cachedManifest) {
        return this.cachedManifest
      }
      throw new Error(`No se pudo obtener el manifest de versiones: ${err.message}`)
    }
  }

  /** Releases desde 1.8.9 hasta la última, más reciente primero */
  async getPlayableVersions(): Promise<{
    latest: string
    versions: PlayableVersion[]
  }> {
    const manifest = await this.getVersionManifest()
    const versions = manifest.versions
      .filter((v) => v.type === 'release' && isPlayableRelease(v.id))
      .map((v) => ({
        id: v.id,
        type: v.type,
        releaseTime: v.releaseTime,
      }))
      .sort((a, b) => {
        const pa = parseReleaseVersion(a.id)!
        const pb = parseReleaseVersion(b.id)!
        return cmpVersion(pb, pa)
      })

    return {
      latest: manifest.latest.release,
      versions,
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
