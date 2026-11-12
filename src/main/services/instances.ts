import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { LoaderType } from './loaders'

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  /** true si viene de un modpack */
  modpack?: boolean
  createdAt: number
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'instancia'
}

/**
 * Cada instancia tiene su carpeta (mods, mundos, options.txt) dentro de <gameDir>/instances.
 * Vanilla usa la carpeta raiz, como siempre, para no perder tus mundos actuales.
 */
export class InstancesService {
  private file = path.join(app.getPath('userData'), 'instances.json')

  list(): Instance[] {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { return [] }
  }

  private save(all: Instance[]) {
    fs.writeFileSync(this.file, JSON.stringify(all, null, 2))
  }

  get(id: string): Instance | undefined {
    return this.list().find(i => i.id === id)
  }

  dir(gameDir: string, id?: string | null): string {
    return id ? path.join(gameDir, 'instances', slug(id)) : gameDir
  }

  /** Instancia automatica para (loader, version). Vanilla => null (carpeta raiz). */
  ensure(mc: string, loader: LoaderType): Instance | null {
    if (loader === 'vanilla') return null
    const id = slug(`${loader}-${mc}`)
    const found = this.get(id)
    if (found) return found
    const inst: Instance = { id, name: `${loader[0].toUpperCase()}${loader.slice(1)} ${mc}`, mcVersion: mc, loader, createdAt: Date.now() }
    this.save([...this.list(), inst])
    return inst
  }

  createModpack(name: string, mc: string, loader: LoaderType): Instance {
    let id = slug(`mp-${name}`)
    const all = this.list()
    let n = 2
    while (all.some(i => i.id === id)) id = slug(`mp-${name}-${n++}`)
    const inst: Instance = { id, name, mcVersion: mc, loader, modpack: true, createdAt: Date.now() }
    this.save([...all, inst])
    return inst
  }

  remove(gameDir: string, id: string) {
    this.save(this.list().filter(i => i.id !== id))
    const d = this.dir(gameDir, id)
    if (d !== gameDir && d.startsWith(path.join(gameDir, 'instances'))) {
      fs.rmSync(d, { recursive: true, force: true })
    }
  }
}
