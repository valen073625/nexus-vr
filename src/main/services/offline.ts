import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'crypto'

export interface OfflineProfile {
  type: 'offline'
  id: string
  username: string
  uuid: string
  createdAt: number
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,16}$/

function getPath() {
  return path.join(app.getPath('userData'), 'offline_profiles.json')
}

export class OfflineService {
  private load(): OfflineProfile[] {
    const p = getPath()
    if (!fs.existsSync(p)) return []
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return [] }
  }

  private save(profiles: OfflineProfile[]) {
    fs.writeFileSync(getPath(), JSON.stringify(profiles, null, 2), 'utf-8')
  }

  createProfile(username: string): OfflineProfile {
    if (!USERNAME_REGEX.test(username)) {
      throw new Error('El nombre debe tener 2-16 caracteres (letras, números, _ o -).')
    }
    const profiles = this.load()
    if (profiles.some(p => p.username.toLowerCase() === username.toLowerCase())) {
      throw new Error(`Ya existe un perfil con el nombre "${username}".`)
    }
    const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest()
    hash[6] = (hash[6] & 0x0f) | 0x30
    hash[8] = (hash[8] & 0x3f) | 0x80
    const hex = hash.toString('hex')
    const uuid = [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20,32)].join('-')
    const profile: OfflineProfile = { type: 'offline', id: uuidv4(), username, uuid, createdAt: Date.now() }
    profiles.push(profile)
    this.save(profiles)
    return profile
  }

  getAllProfiles(): OfflineProfile[] { return this.load() }

  deleteProfile(id: string) {
    this.save(this.load().filter(p => p.id !== id))
  }
}
