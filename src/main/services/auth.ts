import { app, safeStorage } from 'electron'
import { PublicClientApplication, LogLevel } from '@azure/msal-node'
import axios from 'axios'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'

const XBOX_AUTH_URL   = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_AUTH_URL   = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN_URL    = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE_URL  = 'https://api.minecraftservices.com/minecraft/profile'
const MC_ENTITLE_URL  = 'https://api.minecraftservices.com/entitlements/mcstore'

export interface MicrosoftProfile {
  type: 'microsoft'
  id: string
  username: string
  uuid: string
  accessToken: string
  expiresAt: number
}

function getTokenPath() {
  return path.join(app.getPath('userData'), 'ms_token.enc')
}

function saveToken(data: object) {
  const json = JSON.stringify(data)
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(json)
    fs.writeFileSync(getTokenPath(), enc)
  } else {
    fs.writeFileSync(getTokenPath(), Buffer.from(json).toString('base64'))
  }
}

function loadToken(): any | null {
  const p = getTokenPath()
  if (!fs.existsSync(p)) return null
  try {
    const buf = fs.readFileSync(p)
    let json: string
    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(buf)
    } else {
      json = Buffer.from(buf.toString(), 'base64').toString()
    }
    return JSON.parse(json)
  } catch { return null }
}

export class MicrosoftAuthService {
  private pca: PublicClientApplication

  constructor() {
    const clientId = process.env.MS_CLIENT_ID || 'YOUR_CLIENT_ID_HERE'
    this.pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/consumers',
      },
      system: {
        loggerOptions: {
          logLevel: LogLevel.Warning,
          loggerCallback: (level, msg) => { if (level === LogLevel.Error) log.error('[MSAL]', msg) },
          piiLoggingEnabled: false,
        },
      },
    })
  }

  async login(): Promise<MicrosoftProfile> {
    const result = await this.pca.acquireTokenInteractive({
      scopes: ['XboxLive.signin', 'offline_access'],
      openBrowser: async (url) => {
        const { shell } = await import('electron')
        await shell.openExternal(url)
      },
      successTemplate: `<html><body style="font-family:sans-serif;background:#1a1a2e;color:#eee;text-align:center;padding:60px"><h2 style="color:#4ade80">✓ Autenticación exitosa</h2><p>Puedes cerrar esta ventana.</p></body></html>`,
      errorTemplate: `<html><body style="font-family:sans-serif;background:#1a1a2e;color:#eee;text-align:center;padding:60px"><h2 style="color:#f87171">✗ Error</h2><p>{{errorMessage}}</p></body></html>`,
    })

    const mcProfile = await this.exchangeForMinecraft(result.accessToken)
    const profile: MicrosoftProfile = {
      type: 'microsoft',
      id: result.account!.homeAccountId,
      username: mcProfile.name,
      uuid: mcProfile.id,
      accessToken: mcProfile.accessToken,
      expiresAt: Date.now() + 23 * 3600 * 1000,
    }
    saveToken({ msAccountId: result.account!.homeAccountId, mcProfile: profile })
    return profile
  }

  private async exchangeForMinecraft(msToken: string) {
    // Xbox Live
    const xbl = await axios.post(XBOX_AUTH_URL, {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msToken}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })

    const xblToken = xbl.data.Token
    const userHash = xbl.data.DisplayClaims.xui[0].uhs

    // XSTS
    const xsts = await axios.post(XSTS_AUTH_URL, {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })

    const xstsToken = xsts.data.Token

    // Minecraft
    const mc = await axios.post(MC_LOGIN_URL, {
      identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
    }, { headers: { 'Content-Type': 'application/json' } })

    const mcToken: string = mc.data.access_token

    // Verificar entitlement
    const ent = await axios.get(MC_ENTITLE_URL, {
      headers: { Authorization: `Bearer ${mcToken}` },
    })
    const hasJava = ent.data.items?.some(
      (i: any) => i.name === 'product_minecraft' || i.name === 'game_minecraft'
    )
    if (!hasJava) {
      throw new Error('Esta cuenta no tiene Minecraft: Java Edition. Necesitás una licencia válida.')
    }

    // Perfil
    const prof = await axios.get(MC_PROFILE_URL, {
      headers: { Authorization: `Bearer ${mcToken}` },
    })
    return { id: prof.data.id as string, name: prof.data.name as string, accessToken: mcToken }
  }

  async refreshToken(): Promise<MicrosoftProfile | null> {
    const stored = loadToken()
    if (!stored?.msAccountId) return null
    try {
      const accounts = await this.pca.getAllAccounts()
      const account = accounts.find(a => a.homeAccountId === stored.msAccountId)
      if (!account) return null
      const result = await this.pca.acquireTokenSilent({
        scopes: ['XboxLive.signin', 'offline_access'],
        account,
      })
      const mc = await this.exchangeForMinecraft(result.accessToken)
      const profile: MicrosoftProfile = {
        ...stored.mcProfile,
        username: mc.name,
        uuid: mc.id,
        accessToken: mc.accessToken,
        expiresAt: Date.now() + 23 * 3600 * 1000,
      }
      saveToken({ msAccountId: stored.msAccountId, mcProfile: profile })
      return profile
    } catch (err) {
      log.error('Token refresh failed:', err)
      return null
    }
  }

  async getCurrentProfile(): Promise<MicrosoftProfile | null> {
    const stored = loadToken()
    if (!stored?.mcProfile) return null
    if (stored.mcProfile.expiresAt - Date.now() < 3600000) {
      return this.refreshToken()
    }
    return stored.mcProfile
  }

  async logout() {
    const p = getTokenPath()
    if (fs.existsSync(p)) fs.unlinkSync(p)
    await this.pca.clearCache()
  }
}
