import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import log from 'electron-log'
import { VersionsService, type VersionInfo, type ArgRule } from './versions'
import { DownloaderService } from './downloader'
import { SkinsService } from './skins'
import { skinServer } from './skinServer'

export interface OptimizeOptions {
  enabled: boolean
  renderDistance: number
  particles: number
  entityDistance: number
  maxFps: number
  vsync: boolean
  mipmap: number
  clouds: boolean
  fastGraphics: boolean
  smoothLighting: boolean
}

export interface LaunchOptions {
  versionId: string
  gameDir: string
  javaPath: string
  maxRam: number
  minRam: number
  jvmArgs: string
  profileType: 'microsoft' | 'offline'
  profileData: { username: string; uuid: string; accessToken?: string }
  optimize?: OptimizeOptions
}

function writeOptions(gameDir: string, opt: OptimizeOptions) {
  const file = path.join(gameDir, 'options.txt')
  const map = new Map<string, string>()
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf(':')
      if (i > 0) map.set(line.slice(0, i), line.slice(i + 1))
    }
  }
  const set = (k: string, v: string) => map.set(k, v)
  set('renderDistance', String(opt.renderDistance))
  set('particles', String(opt.particles))
  set('entityDistanceScaling', String(opt.entityDistance))
  set('maxFps', String(opt.maxFps))
  set('enableVsync', String(opt.vsync))
  set('mipmapLevels', String(opt.mipmap))
  set('clouds', String(opt.clouds))
  set('graphicsMode', opt.fastGraphics ? '0' : '1')
  set('ao', String(opt.smoothLighting))
  set('biomeBlendRadius', '0')
  set('renderClouds', opt.clouds ? 'true' : 'false')
  const body = Array.from(map.entries()).map(([k, v]) => `${k}:${v}`).join('\n') + '\n'
  fs.writeFileSync(file, body, 'utf8')
}

export class LauncherService {
  private vs = new VersionsService()
  private dl = new DownloaderService()
  private skins = new SkinsService()

  async launch(opts: LaunchOptions): Promise<void> {
    const info = await this.vs.getVersionInfo(opts.versionId)
    fs.mkdirSync(opts.gameDir, { recursive: true })
    if (opts.optimize?.enabled) writeOptions(opts.gameDir, opts.optimize)

    let agentArg: string | null = null
    try {
      const skinPath = this.skins.getActiveFilePath()
      if (skinPath) {
        const skin = await skinServer.start({
          username: opts.profileData.username,
          uuid: opts.profileData.uuid,
          skinPath,
        })
        agentArg = skin.agentArg
      }
    } catch (e: any) {
      log.warn('Skin no aplicada:', e.message)
    }

    const args = this.buildArgs(info, opts, agentArg)
    const proc = spawn(opts.javaPath, args, {
      cwd: opts.gameDir,
      detached: true,
      stdio: 'ignore',
    })
    proc.unref()
    proc.on('error', err => log.error('Error al lanzar:', err))
    proc.on('exit', () => { skinServer.stop().catch(() => {}) })
    log.info(`Minecraft iniciado PID: ${proc.pid} ram=${opts.maxRam}`)
  }

  private buildArgs(info: VersionInfo, opts: LaunchOptions, agentArg: string | null): string[] {
    const args: string[] = []
    const verDir   = path.join(opts.gameDir, 'versions', opts.versionId)
    const nativDir = path.join(verDir, 'natives')
    const assetsDir = path.join(opts.gameDir, 'assets')
    fs.mkdirSync(nativDir, { recursive: true })
    const cp = this.buildClasspath(info, opts.gameDir, opts.versionId)

    const maxRam = Math.max(512, Number(opts.maxRam) || 2048)
    const minRam = Math.min(Math.max(256, Number(opts.minRam) || 512), maxRam)
    args.push(`-Xmx${maxRam}M`, `-Xms${minRam}M`)
    if (agentArg) args.push(agentArg)
    args.push(`-Djava.library.path=${nativDir}`)
    args.push('-Dminecraft.launcher.brand=nexus-launcher')
    args.push('-Dminecraft.launcher.version=1.0.2')
    args.push('-Dlog4j2.formatMsgNoLookups=true')

    if (info.arguments?.jvm) {
      const jvmVars: Record<string, string> = {
        natives_directory: nativDir,
        launcher_name: 'nexus-launcher',
        launcher_version: '1.0.2',
        classpath: cp,
      }
      for (const arg of this.resolveArgs(info.arguments.jvm, jvmVars)) {
        if (arg.startsWith('-Xmx') || arg.startsWith('-Xms')) continue
        args.push(arg)
      }
    } else {
      args.push('-cp', cp)
    }

    if (opts.jvmArgs?.trim()) {
      args.push(...opts.jvmArgs.trim().split(/\s+/))
    }

    if (info.logging?.client) {
      const logFile = path.join(opts.gameDir, 'logging', info.logging.client.file.id)
      if (fs.existsSync(logFile)) {
        args.push(info.logging.client.argument.replace('${path}', logFile))
      }
    }

    args.push(info.mainClass)

    const accessToken = opts.profileType === 'microsoft'
      ? (opts.profileData.accessToken ?? '0')
      : '0'

    const gameVars: Record<string, string> = {
      auth_player_name: opts.profileData.username,
      version_name: opts.versionId,
      game_directory: opts.gameDir,
      assets_root: assetsDir,
      assets_index_name: info.assets,
      auth_uuid: opts.profileData.uuid,
      auth_access_token: accessToken,
      user_type: opts.profileType === 'microsoft' ? 'msa' : 'legacy',
      version_type: info.type,
      clientid: '',
      auth_xuid: '',
      user_properties: '{}',
    }

    if (info.arguments?.game) {
      args.push(...this.resolveArgs(info.arguments.game, gameVars))
    } else if (info.minecraftArguments) {
      args.push(...info.minecraftArguments.split(' ').map(a => this.replaceVars(a, gameVars)))
    }

    return args
  }

  private buildClasspath(info: VersionInfo, gameDir: string, versionId: string): string {
    const sep = process.platform === 'win32' ? ';' : ':'
    const libPaths = this.dl.getLibraryPaths(info, gameDir)
    libPaths.push(path.join(gameDir, 'versions', versionId, `${versionId}.jar`))
    return libPaths.join(sep)
  }

  private resolveArgs(args: (string | ArgRule)[], vars: Record<string, string>): string[] {
    const result: string[] = []
    for (const arg of args) {
      if (typeof arg === 'string') {
        result.push(this.replaceVars(arg, vars))
      } else if (this.rulesAllow(arg.rules)) {
        const vals = Array.isArray(arg.value) ? arg.value : [arg.value]
        result.push(...vals.map(v => this.replaceVars(v, vars)))
      }
    }
    return result
  }

  private replaceVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`)
  }

  private rulesAllow(rules: ArgRule['rules']): boolean {
    let allowed = false
    for (const rule of rules) {
      const osOk = !rule.os || this.osMatches(rule.os)
      const featOk = !rule.features
      if (osOk && featOk) allowed = rule.action === 'allow'
    }
    return allowed
  }

  private osMatches(os: Record<string, string>): boolean {
    if (os.name) {
      const cur = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'
      if (os.name !== cur) return false
    }
    return true
  }
}
