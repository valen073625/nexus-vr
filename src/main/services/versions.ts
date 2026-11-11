import axios from 'axios'
import log from 'electron-log'

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

const ALLOWED_HOSTS = [
  'launchermeta.mojang.com',
  'piston-meta.mojang.com',
  'resources.download.minecraft.net',
  'libraries.minecraft.net',
  'launcher.mojang.com',
  'piston-data.mojang.com',
]

export interface VersionEntry {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  time: string
  releaseTime: string
  sha1: string
  complianceLevel: number
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionEntry[]
}

export interface LibraryEntry {
  name: string
  downloads: {
    artifact?: { path: string; sha1: string; size: number; url: string }
    classifiers?: Record<string, { path: string; sha1: string; size: number; url: string }>
  }
  rules?: { action: string; os?: { name: string } }[]
  natives?: Record<string, string>
  extract?: { exclude: string[] }
}

export interface ArgRule {
  rules: { action: string; features?: Record<string, boolean>; os?: Record<string, string> }[]
  value: string | string[]
}

export interface VersionInfo {
  id: string
  type: string
  time: string
  releaseTime: string
  mainClass: string
  minimumLauncherVersion: number
  javaVersion?: { component: string; majorVersion: number }
  downloads: {
    client: { sha1: string; size: number; url: string }
    client_mappings?: { sha1: string; size: number; url: string }
  }
  assetIndex: { id: string; sha1: string; size: number; totalSize: number; url: string }
  assets: string
  libraries: LibraryEntry[]
  arguments?: { game: (string | ArgRule)[]; jvm: (string | ArgRule)[] }
  minecraftArguments?: string
  logging?: { client: { argument: string; file: { id: string; sha1: string; size: number; url: string }; type: string } }
}

export function validateUrl(url: string) {
  let host: string
  try { host = new URL(url).hostname } catch { throw new Error(`URL inválida: ${url}`) }
  if (!ALLOWED_HOSTS.includes(host)) throw new Error(`URL no permitida: ${url}`)
}

export class VersionsService {
  async getVersionManifest(): Promise<VersionManifest> {
    log.info('Fetching version manifest...')
    const res = await axios.get<VersionManifest>(MANIFEST_URL, { timeout: 15000 })
    return res.data
  }

  async getVersionInfo(versionId: string): Promise<VersionInfo> {
    const manifest = await this.getVersionManifest()
    const entry = manifest.versions.find(v => v.id === versionId)
    if (!entry) throw new Error(`Versión "${versionId}" no encontrada.`)
    validateUrl(entry.url)
    const res = await axios.get<VersionInfo>(entry.url, { timeout: 15000 })
    return res.data
  }
}
