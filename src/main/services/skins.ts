import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import log from 'electron-log'

export interface SkinInfo {
  id: string
  name: string
  fileName: string
  createdAt: string
}

interface SkinsIndex {
  activeId: string | null
  skins: SkinInfo[]
}

export class SkinsService {
  private dir: string
  private indexPath: string

  constructor() {
    this.dir = path.join(app.getPath('userData'), 'skins')
    this.indexPath = path.join(this.dir, 'index.json')
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true })
    }
  }

  private readIndex(): SkinsIndex {
    if (!fs.existsSync(this.indexPath)) {
      return { activeId: null, skins: [] }
    }
    try {
      return JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')) as SkinsIndex
    } catch {
      return { activeId: null, skins: [] }
    }
  }

  private writeIndex(index: SkinsIndex) {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8')
  }

  list(): { activeId: string | null; skins: SkinInfo[] } {
    const index = this.readIndex()
    const skins = index.skins.filter((s) => fs.existsSync(path.join(this.dir, s.fileName)))
    if (skins.length !== index.skins.length) {
      const activeId =
        index.activeId && skins.some((s) => s.id === index.activeId) ? index.activeId : null
      this.writeIndex({ activeId, skins })
      return { activeId, skins }
    }
    return index
  }

  getActive(): SkinInfo | null {
    const { activeId, skins } = this.list()
    if (!activeId) return null
    return skins.find((s) => s.id === activeId) || null
  }

  getActiveFilePath(): string | null {
    const active = this.getActive()
    if (!active) return null
    const p = path.join(this.dir, active.fileName)
    return fs.existsSync(p) ? p : null
  }

  setActive(id: string | null): void {
    const index = this.readIndex()
    if (id === null) {
      index.activeId = null
      this.writeIndex(index)
      return
    }
    if (!index.skins.some((s) => s.id === id)) {
      throw new Error('Skin no encontrada')
    }
    index.activeId = id
    this.writeIndex(index)
  }

  importFromPath(sourcePath: string, displayName?: string): SkinInfo {
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Archivo no encontrado')
    }
    const ext = path.extname(sourcePath).toLowerCase()
    if (ext !== '.png') {
      throw new Error('La skin debe ser un archivo PNG')
    }

    const id = uuidv4()
    const fileName = `${id}.png`
    const dest = path.join(this.dir, fileName)
    fs.copyFileSync(sourcePath, dest)

    const name =
      displayName?.trim() ||
      path.basename(sourcePath, path.extname(sourcePath)).slice(0, 40) ||
      'Skin'

    const info: SkinInfo = {
      id,
      name,
      fileName,
      createdAt: new Date().toISOString(),
    }

    const index = this.readIndex()
    index.skins.unshift(info)
    index.activeId = id
    this.writeIndex(index)
    log.info('Skin imported:', info.name)
    return info
  }

  delete(id: string): void {
    const index = this.readIndex()
    const skin = index.skins.find((s) => s.id === id)
    if (!skin) throw new Error('Skin no encontrada')

    const filePath = path.join(this.dir, skin.fileName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    index.skins = index.skins.filter((s) => s.id !== id)
    if (index.activeId === id) {
      index.activeId = index.skins[0]?.id || null
    }
    this.writeIndex(index)
  }

  getDataUrl(id: string): string | null {
    const index = this.readIndex()
    const skin = index.skins.find((s) => s.id === id)
    if (!skin) return null
    const filePath = path.join(this.dir, skin.fileName)
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  }

  getActiveDataUrl(): string | null {
    const active = this.getActive()
    if (!active) return null
    return this.getDataUrl(active.id)
  }
}
