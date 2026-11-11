import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import axios from 'axios'
import log from 'electron-log'

/**
 * Servidor Yggdrasil minimo + authlib-injector
 * para aplicar skins custom en modo offline.
 */
export class SkinServer {
  private server: http.Server | null = null
  private port = 0
  private skinPath: string | null = null
  private username = 'Player'
  private uuid = ''
  private privateKey!: crypto.KeyObject
  private publicKeyPem = ''
  private authlibJar: string

  constructor() {
    const dir = path.join(app.getPath('userData'), 'authlib')
    fs.mkdirSync(dir, { recursive: true })
    this.authlibJar = path.join(dir, 'authlib-injector.jar')
    this.loadOrCreateKeys(dir)
  }

  private loadOrCreateKeys(dir: string) {
    const privPath = path.join(dir, 'private.pem')
    const pubPath = path.join(dir, 'public.pem')
    if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
      const privPem = fs.readFileSync(privPath, 'utf-8')
      this.publicKeyPem = fs.readFileSync(pubPath, 'utf-8')
      this.privateKey = crypto.createPrivateKey(privPem)
      return
    }
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    fs.writeFileSync(privPath, privateKey)
    fs.writeFileSync(pubPath, publicKey)
    this.publicKeyPem = publicKey
    this.privateKey = crypto.createPrivateKey(privateKey)
  }

  async ensureAuthlibInjector(): Promise<string> {
    if (fs.existsSync(this.authlibJar) && fs.statSync(this.authlibJar).size > 10000) {
      return this.authlibJar
    }
    log.info('Downloading authlib-injector...')
    // Ultimo release conocido (API de GitHub)
    let url =
      'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar'
    try {
      const rel = await axios.get(
        'https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest',
        { timeout: 15000, headers: { 'User-Agent': 'nexus-launcher' } }
      )
      const asset = (rel.data.assets || []).find((a: any) =>
        String(a.name).endsWith('.jar')
      )
      if (asset?.browser_download_url) url = asset.browser_download_url
    } catch (e: any) {
      log.warn('Could not query authlib-injector latest, using fallback', e.message)
    }

    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'nexus-launcher' },
    })
    fs.writeFileSync(this.authlibJar, Buffer.from(res.data))
    log.info('authlib-injector saved', this.authlibJar)
    return this.authlibJar
  }

  private sign(data: string): string {
    const sign = crypto.createSign('SHA1')
    sign.update(data)
    sign.end()
    return sign.sign(this.privateKey).toString('base64')
  }

  private uuidNoDashes(): string {
    return this.uuid.replace(/-/g, '')
  }

  private buildProfile() {
    const texturesObj: any = {
      timestamp: Date.now(),
      profileId: this.uuidNoDashes(),
      profileName: this.username,
      textures: {} as any,
    }

    if (this.skinPath && fs.existsSync(this.skinPath)) {
      texturesObj.textures.SKIN = {
        url: `http://127.0.0.1:${this.port}/textures/skin.png`,
        metadata: { model: 'default' },
      }
    }

    const value = Buffer.from(JSON.stringify(texturesObj), 'utf-8').toString('base64')
    const signature = this.sign(value)

    return {
      id: this.uuidNoDashes(),
      name: this.username,
      properties: [
        {
          name: 'textures',
          value,
          signature,
        },
      ],
    }
  }

  private apiRoot() {
    return {
      meta: {
        serverName: 'NexusLauncher',
        implementationName: 'nexus-launcher',
        implementationVersion: '1.0.0',
        'feature.non_email_login': true,
      },
      skinDomains: ['127.0.0.1', 'localhost'],
      signaturePublickey: this.publicKeyPem,
    }
  }

  async start(opts: { username: string; uuid: string; skinPath: string | null }): Promise<{
    port: number
    apiRoot: string
    agentArg: string
  }> {
    await this.ensureAuthlibInjector()
    this.username = opts.username
    this.uuid = opts.uuid
    this.skinPath = opts.skinPath

    if (this.server) {
      await this.stop()
    }

    await new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        try {
          const url = req.url || '/'
          const u = new URL(url, 'http://127.0.0.1')

          // CORS / simple
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (u.pathname === '/' || u.pathname === '') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(this.apiRoot()))
            return
          }

          if (u.pathname === '/textures/skin.png') {
            if (this.skinPath && fs.existsSync(this.skinPath)) {
              const data = fs.readFileSync(this.skinPath)
              res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'no-cache',
              })
              res.end(data)
            } else {
              res.writeHead(404)
              res.end('no skin')
            }
            return
          }

          // Profile by UUID
          if (u.pathname.startsWith('/sessionserver/session/minecraft/profile/')) {
            const id = u.pathname.split('/').pop() || ''
            if (id.replace(/-/g, '').toLowerCase() === this.uuidNoDashes().toLowerCase()) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(this.buildProfile()))
            } else {
              res.writeHead(204)
              res.end()
            }
            return
          }

          if (u.pathname === '/sessionserver/session/minecraft/hasJoined') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(this.buildProfile()))
            return
          }

          if (u.pathname === '/api/profiles/minecraft' && req.method === 'POST') {
            let body = ''
            req.on('data', (c) => (body += c))
            req.on('end', () => {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify([
                  { id: this.uuidNoDashes(), name: this.username },
                ])
              )
            })
            return
          }

          // Authserver stubs (offline)
          if (
            u.pathname === '/authserver/authenticate' ||
            u.pathname === '/authserver/refresh' ||
            u.pathname === '/authserver/validate'
          ) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                accessToken: '0',
                clientToken: '0',
                selectedProfile: { id: this.uuidNoDashes(), name: this.username },
                availableProfiles: [{ id: this.uuidNoDashes(), name: this.username }],
              })
            )
            return
          }

          res.writeHead(404)
          res.end('not found')
        } catch (e: any) {
          log.error('SkinServer error', e)
          res.writeHead(500)
          res.end('error')
        }
      })

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address()
        if (addr && typeof addr === 'object') {
          this.port = addr.port
          resolve()
        } else {
          reject(new Error('No port'))
        }
      })
      this.server.on('error', reject)
    })

    const apiRoot = `http://127.0.0.1:${this.port}/`
    const agentArg = `-javaagent:${this.authlibJar}=${apiRoot}`
    log.info('SkinServer listening', apiRoot)
    return { port: this.port, apiRoot, agentArg }
  }

  async stop() {
    if (!this.server) return
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve())
    })
    this.server = null
    this.port = 0
  }
}

export const skinServer = new SkinServer()
