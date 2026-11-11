import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import log from 'electron-log'
import { VersionsService, type VersionInfo, type ArgRule } from './versions'
import { DownloaderService } from './downloader'

export interface LaunchOptions {
  versionId: string
  gameDir: string
  javaPath: string
  maxRam: number
  minRam: number
  jvmArgs: string
  profileType: 'microsoft' | 'offline'
  profileData: { username: string; uuid: string; accessToken?: string }
}

export class LauncherService {
  private vs = new VersionsService()
  private dl = new DownloaderService()

  async launch(opts: LaunchOptions): Promise<void> {
    const info = await this.vs.getVersionInfo(opts.versionId)
    const args = this.buildArgs(info, opts)

    log.info(`Lanzando Minecraft ${opts.versionId}`)
    log.info(`Java: ${opts.javaPath}`)
    log.info(`Args[0..5]: ${args.slice(0, 5).join(' ')}`)

    // Crear directorio del juego si no existe
    fs.mkdirSync(opts.gameDir, { recursive: true })

    const proc = spawn(opts.javaPath, args, {
      cwd: opts.gameDir,
      detached: true,
      stdio: 'ignore',
    })
    proc.unref()
    proc.on('error', err => log.error('Error al lanzar:', err))
    log.info(`Minecraft iniciado PID: ${proc.pid}`)
  }

  private buildArgs(info: VersionInfo, opts: LaunchOptions): string[] {
    const args: string[] = []
    const libsDir  = path.join(opts.gameDir, 'libraries')
    const verDir   = path.join(opts.gameDir, 'versions', opts.versionId)
    const nativDir = path.join(verDir, 'natives')
    const assetsDir = path.join(opts.gameDir, 'assets')

    fs.mkdirSync(nativDir, { recursive: true })

    const cp = this.buildClasspath(info, opts.gameDir, opts.versionId)

    // JVM args base
    args.push(`-Xmx${opts.maxRam}M`, `-Xms${opts.minRam}M`)
    args.push(`-Djava.library.path=${nativDir}`)
    args.push('-Dminecraft.launcher.brand=nexus-launcher')
    args.push('-Dminecraft.launcher.version=1.0.0')
    // Fix Log4Shell
    args.push('-Dlog4j2.formatMsgNoLookups=true')

    if (info.arguments?.jvm) {
      const jvmVars: Record<string, string> = {
        natives_directory: nativDir,
        launcher_name: 'nexus-launcher',
        launcher_version: '1.0.0',
        classpath: cp,
      }
      args.push(...this.resolveArgs(info.arguments.jvm, jvmVars))
    } else {
      // Fallback: formatos viejos antes de 1.13
      args.push('-cp', cp)
    }

    // JVM args personalizados del usuario
    if (opts.jvmArgs?.trim()) {
      args.push(...opts.jvmArgs.trim().split(/\s+/))
    }

    // Logging
    if (info.logging?.client) {
      const logFile = path.join(opts.gameDir, 'logging', info.logging.client.file.id)
      if (fs.existsSync(logFile)) {
        args.push(info.logging.client.argument.replace('${path}', logFile))
      }
    }

    // Main class
    args.push(info.mainClass)

    // Game args
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
      // Pre-1.13
      args.push(...info.minecraftArguments
        .split(' ')
        .map(a => this.replaceVars(a, gameVars)))
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
