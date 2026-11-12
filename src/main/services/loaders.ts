import axios from 'axios'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import log from 'electron-log'
import { validateUrl } from './versions'
import type { ProgressCallback } from './downloader'

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader'
const QUILT_META = 'https://meta.quiltmc.org/v3/versions/loader'
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const NEOFORGE_VERSIONS = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'

function dirs(p: string): string[] {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  } catch { return [] }
}

async function getJson<T>(url: string): Promise<T> {
  validateUrl(url, true)
  const r = await axios.get<T>(url, { timeout: 20000 })
  return r.data
}

/** "1.20.4" -> "20.4." | "1.21" -> "21.0." | "26.1" -> "26.1." (formato NeoForge) */
function neoforgePrefix(mc: string): string | null {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(mc)
  if (m) return `${m[1]}.${m[2] ?? '0'}.`
  if (/^\d{2}\./.test(mc)) return mc + '.'
  return null
}

export class LoaderService {
  /** Version del loader a instalar (la mas reciente estable) o null si no hay para esa version de Minecraft. */
  async resolveVersion(loader: LoaderType, mc: string): Promise<string | null> {
    try {
      if (loader === 'fabric') {
        const list = await getJson<{ loader: { version: string; stable: boolean } }[]>(`${FABRIC_META}/${encodeURIComponent(mc)}`)
        return (list.find(x => x.loader.stable) ?? list[0])?.loader.version ?? null
      }
      if (loader === 'quilt') {
        const list = await getJson<{ loader: { version: string } }[]>(`${QUILT_META}/${encodeURIComponent(mc)}`)
        return (list.find(x => !x.loader.version.includes('-')) ?? list[0])?.loader.version ?? null
      }
      if (loader === 'forge') {
        const d = await getJson<{ promos: Record<string, string> }>(FORGE_PROMOS)
        return d.promos[`${mc}-recommended`] ?? d.promos[`${mc}-latest`] ?? null
      }
      if (loader === 'neoforge') {
        const prefix = neoforgePrefix(mc)
        if (!prefix) return null
        const d = await getJson<{ versions: string[] }>(NEOFORGE_VERSIONS)
        const list = d.versions.filter(v => v.startsWith(prefix))
        return ([...list].reverse().find(v => !/alpha|beta/i.test(v)) ?? list[list.length - 1]) ?? null
      }
    } catch (e: any) {
      log.warn(`No se pudo consultar ${loader} para ${mc}:`, e.message)
    }
    return null
  }

  async availability(mc: string): Promise<Record<Exclude<LoaderType, 'vanilla'>, boolean>> {
    const [fabric, quilt, forge, neoforge] = await Promise.all(
      (['fabric', 'quilt', 'forge', 'neoforge'] as const).map(l => this.resolveVersion(l, mc))
    )
    return { fabric: !!fabric, quilt: !!quilt, forge: !!forge, neoforge: !!neoforge }
  }

  /**
   * Instala el loader en gameDir y devuelve el id de version a lanzar.
   * Si ya esta instalado no vuelve a descargar nada.
   */
  async install(
    loader: Exclude<LoaderType, 'vanilla'>,
    mc: string,
    gameDir: string,
    javaPath: string,
    onProgress: ProgressCallback
  ): Promise<string> {
    const ver = await this.resolveVersion(loader, mc)
    if (!ver) {
      throw new Error(`${loader[0].toUpperCase() + loader.slice(1)} no tiene una version para Minecraft ${mc}.`)
    }
    const report = (msg: string, cur = 0, total = 1) =>
      onProgress({ phase: 'loader', current: cur, total, currentFile: msg, speed: 0, downloaded: cur, totalBytes: total })

    if (loader === 'fabric' || loader === 'quilt') {
      const base = loader === 'fabric' ? FABRIC_META : QUILT_META
      report(`Instalando ${loader} ${ver}...`)
      const profile = await getJson<any>(`${base}/${encodeURIComponent(mc)}/${encodeURIComponent(ver)}/profile/json`)
      const id: string = profile.id
      const dir = path.join(gameDir, 'versions', id)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(profile, null, 2))
      report(`${loader} ${ver} listo`, 1, 1)
      return id
    }

    // Forge / NeoForge: se ejecuta el instalador oficial en modo cliente
    const expectedId = loader === 'forge' ? `${mc}-forge-${ver}` : `neoforge-${ver}`
    const hasIt = (id: string) => fs.existsSync(path.join(gameDir, 'versions', id, `${id}.json`))
    if (hasIt(expectedId)) return expectedId

    const url = loader === 'forge'
      ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${ver}/forge-${mc}-${ver}-installer.jar`
      : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${ver}/neoforge-${ver}-installer.jar`
    const instDir = path.join(gameDir, '.nexus', 'installers')
    fs.mkdirSync(instDir, { recursive: true })
    const jar = path.join(instDir, path.basename(url))

    report(`Descargando instalador de ${loader} ${ver}...`)
    validateUrl(url, true)
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 180000 })
    const data = Buffer.from(res.data)
    try {
      const sha = (await axios.get(url + '.sha1', { timeout: 15000, responseType: 'text' })).data.toString().trim().split(/\s+/)[0]
      if (/^[a-f0-9]{40}$/i.test(sha) && crypto.createHash('sha1').update(data).digest('hex') !== sha.toLowerCase()) {
        throw new Error('SHA-1 del instalador no coincide')
      }
    } catch (e: any) {
      if (/SHA-1/.test(e.message)) throw e
    }
    fs.writeFileSync(jar, data)

    // El instalador exige este archivo en la carpeta destino
    const profiles = path.join(gameDir, 'launcher_profiles.json')
    if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, version: 3 }))

    const before = new Set(dirs(path.join(gameDir, 'versions')))
    report(`Instalando ${loader} ${ver} (puede tardar unos minutos)...`)
    await new Promise<void>((resolve, reject) => {
      execFile(javaPath, ['-jar', jar, '--installClient', gameDir], { timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, cwd: gameDir }, (err, stdout, stderr) => {
        log.info(`[${loader} installer]`, String(stdout).slice(-2000))
        if (err) {
          log.error(`[${loader} installer] error`, String(stderr).slice(-2000))
          reject(new Error(`Fallo el instalador de ${loader}: ${String(stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' ')}`))
        } else resolve()
      })
    })
    try { fs.unlinkSync(jar) } catch { /* ignore */ }

    let id = expectedId
    if (!hasIt(id)) {
      const added = dirs(path.join(gameDir, 'versions')).filter(d => !before.has(d) && d.toLowerCase().includes(loader))
      if (added[0]) id = added[0]
    }
    if (!hasIt(id)) throw new Error(`${loader} se instalo pero no se encontro la version ${expectedId}.`)
    report(`${loader} ${ver} listo`, 1, 1)
    return id
  }
}
