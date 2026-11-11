import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export interface Profile {
  id: string
  type: 'microsoft' | 'offline'
  username: string
  uuid: string
  accessToken?: string
  expiresAt?: number
}

interface Store { activeId: string | null; profiles: Profile[] }

export class ProfilesService {
  private p = path.join(app.getPath('userData'), 'profiles.json')

  private load(): Store {
    if (!fs.existsSync(this.p)) return { activeId: null, profiles: [] }
    try { return JSON.parse(fs.readFileSync(this.p, 'utf-8')) } catch { return { activeId: null, profiles: [] } }
  }
  private save(s: Store) { fs.writeFileSync(this.p, JSON.stringify(s, null, 2), 'utf-8') }

  getAllProfiles() { return this.load().profiles }
  getActiveProfile() {
    const s = this.load()
    return s.activeId ? (s.profiles.find(p => p.id === s.activeId) ?? null) : null
  }
  upsertProfile(profile: Profile) {
    const s = this.load()
    const idx = s.profiles.findIndex(p => p.id === profile.id)
    if (idx >= 0) s.profiles[idx] = profile; else s.profiles.push(profile)
    if (!s.activeId) s.activeId = profile.id
    this.save(s)
  }
  setActiveProfile(id: string) {
    const s = this.load()
    if (!s.profiles.some(p => p.id === id)) throw new Error(`Perfil ${id} no encontrado.`)
    s.activeId = id
    this.save(s)
  }
  deleteProfile(id: string) {
    const s = this.load()
    s.profiles = s.profiles.filter(p => p.id !== id)
    if (s.activeId === id) s.activeId = s.profiles[0]?.id ?? null
    this.save(s)
  }
}
