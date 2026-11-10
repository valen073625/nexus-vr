import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export interface Profile {
  id: string
  name: string
  version: string
  javaPath?: string
  gameDir?: string
  jvmArgs?: string
  createdAt: string
  lastUsed?: string
}

export class ProfilesService {
  private profilesPath: string
  private activeIdPath: string

  constructor() {
    const userData = app.getPath('userData')
    this.profilesPath = path.join(userData, 'profiles.json')
    this.activeIdPath = path.join(userData, 'active-profile.json')
  }

  private readProfiles(): Profile[] {
    if (!fs.existsSync(this.profilesPath)) {
      // Perfil por defecto
      const defaultProfile: Profile = {
        id: uuidv4(),
        name: 'Default',
        version: 'latest-release',
        createdAt: new Date().toISOString(),
      }
      this.writeProfiles([defaultProfile])
      this.setActiveProfile(defaultProfile.id)
      return [defaultProfile]
    }
    try {
      return JSON.parse(fs.readFileSync(this.profilesPath, 'utf-8')) as Profile[]
    } catch {
      return []
    }
  }

  private writeProfiles(profiles: Profile[]): void {
    fs.writeFileSync(this.profilesPath, JSON.stringify(profiles, null, 2), 'utf-8')
  }

  getAllProfiles(): Profile[] {
    return this.readProfiles()
  }

  getActiveProfile(): Profile | null {
    const profiles = this.readProfiles()
    if (profiles.length === 0) return null

    let activeId: string | null = null
    if (fs.existsSync(this.activeIdPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.activeIdPath, 'utf-8'))
        activeId = data.id
      } catch {
        // ignore
      }
    }

    if (activeId) {
      const found = profiles.find((p) => p.id === activeId)
      if (found) return found
    }

    return profiles[0]
  }

  setActiveProfile(id: string): void {
    const profiles = this.readProfiles()
    const profile = profiles.find((p) => p.id === id)
    if (!profile) {
      throw new Error(`Profile not found: ${id}`)
    }
    fs.writeFileSync(this.activeIdPath, JSON.stringify({ id }, null, 2), 'utf-8')
  }

  deleteProfile(id: string): void {
    let profiles = this.readProfiles()
    const before = profiles.length
    profiles = profiles.filter((p) => p.id !== id)
    if (profiles.length === before) {
      throw new Error(`Profile not found: ${id}`)
    }
    if (profiles.length === 0) {
      throw new Error('Cannot delete the last profile')
    }
    this.writeProfiles(profiles)

    // Si el eliminado era el activo, activar el primero
    const active = this.getActiveProfile()
    if (!active || active.id === id) {
      this.setActiveProfile(profiles[0].id)
    }
  }

  createProfile(name: string, version: string): Profile {
    const profiles = this.readProfiles()
    const profile: Profile = {
      id: uuidv4(),
      name,
      version,
      createdAt: new Date().toISOString(),
    }
    profiles.push(profile)
    this.writeProfiles(profiles)
    return profile
  }
}
