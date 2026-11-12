import axios from 'axios'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

/** Archivos del juego base: SOLO servidores oficiales de Mojang. */
const ALLOWED_HOSTS = [
  'launchermeta.mojang.com',
  'piston-meta.mojang.com',
  'resources.download.minecraft.net',
  'libraries.minecraft.net',
  'launcher.mojang.com',
  'piston-data.mojang.com',
]

/** Loaders oficiales (Fabric, Quilt, Forge, NeoForge) y su Maven. */
const LOADER_HOSTS = [
  'meta.fabricmc.net',
  'maven.fabricmc.net',
  'meta.quiltmc.org',
  'maven.quiltmc.org',
  'files.minecraftforge.net',
  'maven.minecraftforge.net',
  'maven.neoforged.net',
  'maven.creeperhost.net',
  'repo1.maven.org',
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

interface ArtifactInfo { path: string; sha1: string; size: number; url: string }

export interface LibraryEntry {
  name: string
  /** Librerias estilo Maven (Fabric/Quilt): solo traen name + url base */
  url?: string
  downloads?: {
    artifact?: ArtifactInfo
    classifiers?: Record<string, ArtifactInfo>
  }
  rules?: { action: string; os?: { name?: string; arch?: string } }[]
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
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
  inheritsFrom?: string
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

export function validateUrl(url: string, allowLoaders = false) {
  let u: URL
  try { u = new URL(url) } catch { throw new Error(`URL inválida: ${url}`) }
  if (u.protocol !== 'https:') throw new Error(`URL no segura: ${url}`)
  const host = u.hostname
  const ok = ALLOWED_HOSTS.includes(host) || (allowLoaders && LOADER_HOSTS.includes(host))
  if (!ok) throw new Error(`URL no permitida: ${url}`)
}

/** group:artifact:version[:classifier][@ext] -> ruta Maven */
export function mavenPath(name: string): string {
  const [coords, ext = 'jar'] = name.split('@')
  const [g, a, v, cl] = coords.split(':')
  return `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}${cl ? '-' + cl : ''}.${ext}`
}

export interface LibArtifact { path: string; url: string; sha1?: string }

/** Artefacto principal de una libreria, sea formato Mojang o Maven. */
export function libArtifact(lib: LibraryEntry): LibArtifact | null {
  const art = lib.downloads?.artifact
  if (art) return { path: art.path, url: art.url, sha1: art.sha1 }
  if (!lib.downloads && lib.name && lib.url) {
    const p = mavenPath(lib.name)
    return { path: p, url: lib.url.replace(/\/?$/, '/') + p }
  }
  return null
}

function libKey(lib: LibraryEntry): string {
  const [g, a, , cl] = lib.name.split('@')[0].split(':')
  return `${g}:${a}${cl ? ':' + cl : ''}`
}

/** Une el JSON de un loader (inheritsFrom) con el JSON de Minecraft vanilla. */
export function mergeVersion(parent: VersionInfo, child: VersionInfo): VersionInfo {
  const seen = new Set<string>()
  const libraries: LibraryEntry[] = []
  for (const lib of [...(child.libraries || []), ...(parent.libraries || [])]) {
    const k = libKey(lib)
    if (seen.has(k)) continue
    seen.add(k)
    libraries.push(lib)
  }
  const hasArgs = !!(parent.arguments || child.arguments)
  return {
    ...parent,
    ...child,
    id: child.id,
    mainClass: child.mainClass || parent.mainClass,
    downloads: parent.downloads,
    assetIndex: parent.assetIndex,
    assets: parent.assets,
    logging: child.logging || parent.logging,
    javaVersion: child.javaVersion || parent.javaVersion,
    libraries,
    arguments: hasArgs
      ? {
          game: [...(parent.arguments?.game || []), ...(child.arguments?.game || [])],
          jvm: [...(parent.arguments?.jvm || []), ...(child.arguments?.jvm || [])],
        }
      : undefined,
    minecraftArguments: child.minecraftArguments || parent.minecraftArguments,
  }
}

export class VersionsService {
  async getVersionManifest(): Promise<VersionManifest> {
    log.info('Fetching version manifest...')
    const res = await axios.get<VersionManifest>(MANIFEST_URL, { timeout: 15000 })
    return res.data
  }

  async getPlayableVersions() {
    const manifest = await this.getVersionManifest()
    const releases = manifest.versions.filter((v) => v.type === 'release')
    const snapshots = manifest.versions.filter((v) => v.type === 'snapshot')
    return {
      latest: manifest.latest,
      releases,
      snapshots,
      versions: [...releases, ...snapshots],
    }
  }

  /**
   * Devuelve el JSON de la version. Si hay uno local (loaders o vanilla ya
   * descargado) lo usa; si hereda de otra version lo combina con el padre.
   */
  async getVersionInfo(versionId: string, gameDir?: string): Promise<VersionInfo> {
    if (gameDir) {
      const local = path.join(gameDir, 'versions', versionId, `${versionId}.json`)
      if (fs.existsSync(local)) {
        try {
          const child = JSON.parse(fs.readFileSync(local, 'utf-8')) as VersionInfo
          if (child.inheritsFrom) {
            const parent = await this.getVersionInfo(child.inheritsFrom, gameDir)
            return mergeVersion(parent, child)
          }
          if (child.downloads?.client) return child
        } catch (e: any) {
          log.warn('JSON local invalido, se vuelve a pedir:', local, e.message)
        }
      }
    }
    const manifest = await this.getVersionManifest()
    const entry = manifest.versions.find(v => v.id === versionId)
    if (!entry) throw new Error(`Versión "${versionId}" no encontrada.`)
    validateUrl(entry.url)
    const res = await axios.get<VersionInfo>(entry.url, { timeout: 15000 })
    return res.data
  }
}
