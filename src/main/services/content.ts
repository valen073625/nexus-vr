import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import extract from 'extract-zip'
import log from 'electron-log'
import type { LoaderType } from './loaders'

export type ContentType = 'mod' | 'modpack' | 'resourcepack' | 'shader'
export type ContentSource = 'modrinth' | 'curseforge'

export interface ContentItem {
  source: ContentSource
  id: string
  slug: string
  type: ContentType
  title: string
  description: string
  icon?: string
  author?: string
  downloads: number
  url: string
}

export interface InstallResult {
  success: boolean
  installed: string[]
  skipped: string[]
  message?: string
  /** Solo para modpacks: datos para crear la instancia */
  modpack?: { name: string; mcVersion: string; loader: LoaderType }
}

export type ContentProgress = (msg: string, current?: number, total?: number) => void

const UA = 'valen073625/nexus-vr (Nexus Launcher)'
const MR = 'https://api.modrinth.com/v2'
const CF = 'https://api.curseforge.com/v1'

const CONTENT_HOSTS = [
  'api.modrinth.com', 'cdn.modrinth.com',
  'api.curseforge.com', 'edge.forgecdn.net', 'mediafilez.forgecdn.net', 'media.forgecdn.net',
]

const FOLDER: Record<ContentType, string> = { mod: 'mods', modpack: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }
const CF_CLASS: Record<ContentType, number> = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552 }
const CF_LOADER: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }

/** Mods de rendimiento (Modrinth). Se instalan los que existan para esa version/loader. */
const OPTIMIZE_MODS: Record<string, string[]> = {
  fabric: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix'],
  quilt: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix'],
  forge: ['embeddium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix'],
  neoforge: ['sodium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix'],
}
const HUD_MOD = 'fps-overlay' // FPS, ping/ms, RAM dentro de Minecraft

function assertContentUrl(url: string) {
  let u: URL
  try { u = new URL(url) } catch { throw new Error(`URL inválida: ${url}`) }
  if (u.protocol !== 'https:' || !CONTENT_HOSTS.includes(u.hostname)) throw new Error(`URL no permitida: ${url}`)
}

function inside(root: string, target: string): boolean {
  const r = path.resolve(root) + path.sep
  return (path.resolve(target) + path.sep).startsWith(r)
}

function sha(algo: string, data: Buffer) {
  return crypto.createHash(algo).update(data).digest('hex')
}

export class ContentService {
  constructor(private getCurseKey: () => string) {}

  // ───────────────────────── HTTP ─────────────────────────
  private async get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    assertContentUrl(url)
    const r = await axios.get<T>(url, { timeout: 20000, headers: { 'User-Agent': UA, ...headers } })
    return r.data
  }

  private cfHeaders() {
    const key = this.getCurseKey()?.trim()
    if (!key) throw new Error('Falta tu clave de API de CurseForge. Pegala en Configuración (es gratis en console.curseforge.com).')
    return { 'x-api-key': key, Accept: 'application/json' }
  }

  private async fetchFile(url: string, dest: string, check?: { algo: 'sha1' | 'sha512'; hash: string }): Promise<boolean> {
    if (check && fs.existsSync(dest) && sha(check.algo, fs.readFileSync(dest)) === check.hash.toLowerCase()) return false
    assertContentUrl(url)
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 300000,
      maxContentLength: Infinity,
      headers: { 'User-Agent': UA },
      beforeRedirect: (o: any) => assertContentUrl(`https://${o.hostname}/`),
    } as any)
    const data = Buffer.from(res.data)
    if (check && sha(check.algo, data) !== check.hash.toLowerCase()) {
      throw new Error(`El hash de ${path.basename(dest)} no coincide; se descarta el archivo.`)
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
    return true
  }

  // ───────────────────────── Busqueda ─────────────────────────
  async search(o: {
    source: ContentSource; type: ContentType; query: string; mcVersion?: string; loader?: LoaderType; page?: number
  }): Promise<{ items: ContentItem[]; total: number }> {
    const page = Math.max(0, o.page ?? 0)
    const useLoader = o.loader && o.loader !== 'vanilla' && (o.type === 'mod' || o.type === 'modpack')

    if (o.source === 'modrinth') {
      const facets: string[][] = [[`project_type:${o.type}`]]
      if (o.mcVersion) facets.push([`versions:${o.mcVersion}`])
      if (useLoader) facets.push([`categories:${o.loader}`])
      const q = new URLSearchParams({
        query: o.query || '', limit: '20', offset: String(page * 20),
        index: o.query ? 'relevance' : 'downloads', facets: JSON.stringify(facets),
      })
      const d = await this.get<any>(`${MR}/search?${q}`)
      return {
        total: d.total_hits ?? 0,
        items: (d.hits as any[]).map(h => ({
          source: 'modrinth' as const, id: h.project_id, slug: h.slug, type: o.type,
          title: h.title, description: h.description, icon: h.icon_url || undefined,
          author: h.author, downloads: h.downloads ?? 0,
          url: `https://modrinth.com/${o.type}/${h.slug}`,
        })),
      }
    }

    const q = new URLSearchParams({
      gameId: '432', classId: String(CF_CLASS[o.type]), searchFilter: o.query || '',
      pageSize: '20', index: String(page * 20), sortField: '2', sortOrder: 'desc',
    })
    if (o.mcVersion) q.set('gameVersion', o.mcVersion)
    if (useLoader && CF_LOADER[o.loader!]) q.set('modLoaderType', String(CF_LOADER[o.loader!]))
    const d = await this.get<any>(`${CF}/mods/search?${q}`, this.cfHeaders())
    return {
      total: d.pagination?.totalCount ?? 0,
      items: (d.data as any[]).map(m => ({
        source: 'curseforge' as const, id: String(m.id), slug: m.slug, type: o.type,
        title: m.name, description: m.summary, icon: m.logo?.thumbnailUrl || undefined,
        author: m.authors?.[0]?.name, downloads: m.downloadCount ?? 0,
        url: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/${m.slug}`,
      })),
    }
  }

  // ───────────────────────── Instalar ─────────────────────────
  /**
   * Instala un elemento. targetDir es la carpeta de la instancia (la que contiene mods/, resourcepacks/...).
   * Para modpacks, targetDir es la carpeta de la instancia nueva.
   */
  async install(o: {
    source: ContentSource; type: ContentType; projectId: string
    mcVersion: string; loader: LoaderType; targetDir: string
  }, progress: ContentProgress): Promise<InstallResult> {
    const result: InstallResult = { success: true, installed: [], skipped: [] }
    try {
      if (o.type === 'modpack') {
        return o.source === 'modrinth'
          ? await this.installMrpack(o, progress)
          : await this.installCfPack(o, progress)
      }
      if (o.type === 'mod' && o.loader === 'vanilla') {
        throw new Error('Los mods necesitan Fabric, Quilt, Forge o NeoForge. Elegi un loader arriba.')
      }
      if (o.type === 'shader') await this.ensureShaderSupport(o, result, progress)
      if (o.source === 'modrinth') {
        await this.mrInstall(o.projectId, o.type, o.mcVersion, o.loader, o.targetDir, result, progress, new Set())
      } else {
        await this.cfInstall(o.projectId, o.type, o.mcVersion, o.loader, o.targetDir, result, progress, new Set())
      }
      if (result.installed.length === 0 && result.skipped.length === 0) result.message = 'Ya estaba instalado.'
    } catch (e: any) {
      log.error('Content install error:', e)
      result.success = false
      result.message = e.response?.status === 403 && o.source === 'curseforge'
        ? 'CurseForge rechazo la clave de API. Revisala en Configuración.'
        : e.message
    }
    return result
  }

  /** Los shaders necesitan Iris (Fabric/Quilt) u Oculus (Forge/NeoForge). */
  private async ensureShaderSupport(o: { mcVersion: string; loader: LoaderType; targetDir: string }, result: InstallResult, progress: ContentProgress) {
    if (o.loader === 'vanilla') {
      result.skipped.push('Los shaders no funcionan en vanilla: elegi Fabric (Iris) o Forge/NeoForge (Oculus).')
      throw new Error('Para usar shaders elegi un loader (Fabric recomendado) y se instala Iris automaticamente.')
    }
    const slug = o.loader === 'fabric' || o.loader === 'quilt' ? 'iris' : 'oculus'
    try {
      await this.mrInstall(slug, 'mod', o.mcVersion, o.loader, o.targetDir, result, progress, new Set())
    } catch (e: any) {
      result.skipped.push(`No pude instalar ${slug} (${e.message}). Sin eso los shaders no se ven.`)
    }
  }

  // ── Modrinth ──
  private async mrInstall(
    project: string, type: ContentType, mc: string, loader: LoaderType, dir: string,
    result: InstallResult, progress: ContentProgress, seen: Set<string>, depth = 0
  ) {
    if (seen.has(project) || depth > 3) return
    seen.add(project)
    const q = new URLSearchParams({ game_versions: JSON.stringify([mc]) })
    if (type === 'mod' && loader !== 'vanilla') q.set('loaders', JSON.stringify([loader]))
    const versions = await this.get<any[]>(`${MR}/project/${encodeURIComponent(project)}/version?${q}`)
    const v = versions.find(x => x.version_type === 'release') ?? versions[0]
    if (!v) throw new Error(`"${project}" no tiene una version para Minecraft ${mc}${type === 'mod' ? ` con ${loader}` : ''}.`)
    const file = v.files.find((f: any) => f.primary) ?? v.files[0]
    const name = path.basename(file.filename)
    progress(`Descargando ${name}...`)
    const downloaded = await this.fetchFile(file.url, path.join(dir, FOLDER[type], name), { algo: 'sha1', hash: file.hashes.sha1 })
    if (downloaded) result.installed.push(name)
    for (const dep of v.dependencies ?? []) {
      if (dep.dependency_type === 'required' && dep.project_id) {
        try { await this.mrInstall(dep.project_id, 'mod', mc, loader, dir, result, progress, seen, depth + 1) }
        catch (e: any) { result.skipped.push(`Dependencia ${dep.project_id}: ${e.message}`) }
      }
    }
  }

  // ── CurseForge ──
  private async cfInstall(
    modId: string, type: ContentType, mc: string, loader: LoaderType, dir: string,
    result: InstallResult, progress: ContentProgress, seen: Set<string>, depth = 0
  ) {
    if (seen.has(modId) || depth > 3) return
    seen.add(modId)
    const q = new URLSearchParams({ gameVersion: mc, pageSize: '20' })
    if (type === 'mod' && CF_LOADER[loader]) q.set('modLoaderType', String(CF_LOADER[loader]))
    const files = (await this.get<any>(`${CF}/mods/${modId}/files?${q}`, this.cfHeaders())).data as any[]
    const f = files.find(x => x.releaseType === 1) ?? files[0]
    if (!f) throw new Error(`Ese contenido no tiene archivo para Minecraft ${mc}${type === 'mod' ? ` con ${loader}` : ''}.`)
    if (!f.downloadUrl) {
      // El autor no permite descargas fuera de CurseForge: se respeta, no se evade.
      result.skipped.push(`${f.fileName}: el autor solo permite descargarlo desde la pagina de CurseForge.`)
      return
    }
    const name = path.basename(f.fileName)
    const sha1 = (f.hashes as any[])?.find(h => h.algo === 1)?.value
    progress(`Descargando ${name}...`)
    const downloaded = await this.fetchFile(f.downloadUrl, path.join(dir, FOLDER[type], name), sha1 ? { algo: 'sha1', hash: sha1 } : undefined)
    if (downloaded) result.installed.push(name)
    for (const dep of f.dependencies ?? []) {
      if (dep.relationType === 3) {
        try { await this.cfInstall(String(dep.modId), 'mod', mc, loader, dir, result, progress, seen, depth + 1) }
        catch (e: any) { result.skipped.push(`Dependencia ${dep.modId}: ${e.message}`) }
      }
    }
  }

  // ───────────────────────── Modpacks ─────────────────────────
  private tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pack-'))
  }

  private copyOverrides(from: string, to: string) {
    if (!fs.existsSync(from)) return
    fs.cpSync(from, to, {
      recursive: true,
      force: true,
      filter: (src) => inside(from, src) || path.resolve(src) === path.resolve(from),
    })
  }

  private async installMrpack(o: { projectId: string; mcVersion: string; loader: LoaderType; targetDir: string }, progress: ContentProgress): Promise<InstallResult> {
    const result: InstallResult = { success: true, installed: [], skipped: [] }
    const versions = await this.get<any[]>(`${MR}/project/${encodeURIComponent(o.projectId)}/version`)
    const v = versions.find(x => x.version_type === 'release') ?? versions[0]
    if (!v) throw new Error('Ese modpack no tiene versiones.')
    const file = v.files.find((f: any) => f.primary) ?? v.files[0]
    const tmp = this.tmp()
    try {
      const pack = path.join(tmp, 'pack.mrpack')
      progress(`Descargando modpack ${file.filename}...`)
      await this.fetchFile(file.url, pack, { algo: 'sha1', hash: file.hashes.sha1 })
      const ex = path.join(tmp, 'x')
      await extract(pack, { dir: ex })
      const idx = JSON.parse(fs.readFileSync(path.join(ex, 'modrinth.index.json'), 'utf8'))
      const deps = idx.dependencies || {}
      const mc: string = deps.minecraft
      const loader: LoaderType = deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla'
      const files = (idx.files as any[]).filter(f => f.env?.client !== 'unsupported')
      let n = 0
      for (const f of files) {
        const dest = path.join(o.targetDir, f.path)
        if (!inside(o.targetDir, dest)) { result.skipped.push(`${f.path}: ruta no valida`); continue }
        progress(`Descargando ${path.basename(f.path)}...`, ++n, files.length)
        try {
          if (await this.fetchFile(f.downloads[0], dest, { algo: 'sha1', hash: f.hashes.sha1 })) result.installed.push(path.basename(f.path))
        } catch (e: any) { result.skipped.push(`${path.basename(f.path)}: ${e.message}`) }
      }
      this.copyOverrides(path.join(ex, 'overrides'), o.targetDir)
      this.copyOverrides(path.join(ex, 'client-overrides'), o.targetDir)
      result.modpack = { name: idx.name || file.filename, mcVersion: mc, loader }
      return result
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }

  private async installCfPack(o: { projectId: string; mcVersion: string; loader: LoaderType; targetDir: string }, progress: ContentProgress): Promise<InstallResult> {
    const result: InstallResult = { success: true, installed: [], skipped: [] }
    const headers = this.cfHeaders()
    const files = (await this.get<any>(`${CF}/mods/${o.projectId}/files?pageSize=10`, headers)).data as any[]
    const f = files.find(x => x.releaseType === 1) ?? files[0]
    if (!f) throw new Error('Ese modpack no tiene archivos.')
    if (!f.downloadUrl) throw new Error('El autor de este modpack solo permite descargarlo desde la pagina de CurseForge.')
    const tmp = this.tmp()
    try {
      const zip = path.join(tmp, 'pack.zip')
      progress(`Descargando modpack ${f.fileName}...`)
      const sha1 = (f.hashes as any[])?.find(h => h.algo === 1)?.value
      await this.fetchFile(f.downloadUrl, zip, sha1 ? { algo: 'sha1', hash: sha1 } : undefined)
      const ex = path.join(tmp, 'x')
      await extract(zip, { dir: ex })
      const man = JSON.parse(fs.readFileSync(path.join(ex, 'manifest.json'), 'utf8'))
      const mc: string = man.minecraft.version
      const lid: string = (man.minecraft.modLoaders?.find((l: any) => l.primary) ?? man.minecraft.modLoaders?.[0])?.id ?? ''
      const loader = (['neoforge', 'forge', 'fabric', 'quilt'].find(l => lid.startsWith(l)) ?? 'vanilla') as LoaderType

      const ids = (man.files as any[]).map(x => x.fileID)
      const meta = (await axios.post(`${CF}/mods/files`, { fileIds: ids }, { headers: { ...headers, 'User-Agent': UA }, timeout: 30000 })).data.data as any[]
      let n = 0
      for (const m of meta) {
        const name = path.basename(m.fileName)
        progress(`Descargando ${name}...`, ++n, meta.length)
        if (!m.downloadUrl) { result.skipped.push(`${name}: solo se descarga desde CurseForge`); continue }
        const folder = name.endsWith('.jar') ? 'mods' : 'resourcepacks'
        const h = (m.hashes as any[])?.find(x => x.algo === 1)?.value
        try {
          if (await this.fetchFile(m.downloadUrl, path.join(o.targetDir, folder, name), h ? { algo: 'sha1', hash: h } : undefined)) result.installed.push(name)
        } catch (e: any) { result.skipped.push(`${name}: ${e.message}`) }
      }
      this.copyOverrides(path.join(ex, man.overrides || 'overrides'), o.targetDir)
      result.modpack = { name: man.name || f.fileName, mcVersion: mc, loader }
      return result
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }

  // ───────────────── Mods administrados por el launcher ─────────────────
  private managedFile(dir: string) { return path.join(dir, '.nexus-managed.json') }

  private readManaged(dir: string): Record<string, string[]> {
    try { return JSON.parse(fs.readFileSync(this.managedFile(dir), 'utf8')) } catch { return {} }
  }

  /**
   * Instala (o quita) el grupo 'optimize' (Sodium, Lithium...) o 'hud' (FPS/ms en pantalla).
   * Solo borra lo que el propio launcher agrego, nunca mods tuyos.
   */
  async syncManaged(group: 'optimize' | 'hud', enabled: boolean, mc: string, loader: LoaderType, dir: string, progress: ContentProgress): Promise<{ installed: string[]; missing: string[] }> {
    const state = this.readManaged(dir)
    const out = { installed: [] as string[], missing: [] as string[] }
    if (!enabled) {
      for (const f of state[group] ?? []) {
        try { fs.rmSync(path.join(dir, 'mods', path.basename(f)), { force: true }) } catch { /* ignore */ }
      }
      delete state[group]
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.managedFile(dir), JSON.stringify(state))
      return out
    }
    if (loader === 'vanilla') {
      out.missing.push('Necesita Fabric/Quilt/Forge/NeoForge')
      return out
    }
    const slugs = group === 'hud' ? [HUD_MOD] : OPTIMIZE_MODS[loader] ?? []
    const mine = new Set(state[group] ?? [])
    const seen = new Set<string>()
    for (const slug of slugs) {
      const r: InstallResult = { success: true, installed: [], skipped: [] }
      try {
        await this.mrInstall(slug, 'mod', mc, loader, dir, r, progress, seen)
        r.installed.forEach(f => mine.add(f))
        out.installed.push(...r.installed)
      } catch (e: any) {
        log.warn(`Managed mod ${slug} no disponible:`, e.message)
        out.missing.push(slug)
      }
    }
    state[group] = [...mine]
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(this.managedFile(dir), JSON.stringify(state))
    return out
  }

  // ───────────────── Contenido instalado ─────────────────
  listInstalled(dir: string) {
    const out: Record<string, { name: string; size: number }[]> = {}
    for (const [key, folder] of [['mods', 'mods'], ['resourcepacks', 'resourcepacks'], ['shaders', 'shaderpacks']] as const) {
      const p = path.join(dir, folder)
      out[key] = fs.existsSync(p)
        ? fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isFile()).map(d => ({ name: d.name, size: fs.statSync(path.join(p, d.name)).size }))
        : []
    }
    return out
  }

  remove(dir: string, kind: 'mods' | 'resourcepacks' | 'shaders', name: string) {
    const folder = kind === 'shaders' ? 'shaderpacks' : kind
    const target = path.join(dir, folder, path.basename(name))
    if (!inside(path.join(dir, folder), target)) throw new Error('Ruta no valida')
    fs.rmSync(target, { force: true })
  }
}
