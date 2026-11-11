import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import log from 'electron-log'
import { SettingsService } from './settings'
import { JavaService } from './java'
import { JavaRuntimesService } from './javaRuntimes'
import { InstallService, ProgressCallback } from './install'
import { SkinsService } from './skins'
import { skinServer } from './skinServer'

function offlineUUID(username: string): string {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function applyTemplates(arg: string, map: Record<string, string>): string | null {
  let result = arg
  for (const [key, value] of Object.entries(map)) {
    result = result.split(key).join(value)
  }
  if (/\$\{/.test(result)) return null
  return result
}

function osName(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

function rulesAllow(rules: any[] | undefined): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    let match = true
    if (rule.os?.name && rule.os.name !== osName()) match = false
    if (rule.os?.arch) {
      const arch = process.arch === 'x64' ? 'x86_64' : process.arch
      if (rule.os.arch !== arch && rule.os.arch !== process.arch) match = false
    }
    if (rule.features) {
      match = false
    }
    if (match) {
      allowed = rule.action === 'allow'
    }
  }
  return allowed
}

export type GameExitInfo = {
  code: number | null
  quickCrash: boolean
  logTail: string
  message?: string
}

export type GameExitCallback = (info: GameExitInfo) => void

export class LaunchService {
  private settings = new SettingsService()
  private java = new JavaService()
  private runtimes = new JavaRuntimesService()
  private install = new InstallService()
  private skins = new SkinsService()
  private gameProcess: ChildProcess | null = null
  private onGameExit: GameExitCallback | null = null
  private launchedAt = 0
  private logBuffer: string[] = []

  setOnGameExit(cb: GameExitCallback | null) {
    this.onGameExit = cb
  }

  isGameRunning(): boolean {
    return this.gameProcess !== null && this.gameProcess.exitCode === null
  }

  private pushLog(line: string) {
    const t = line.trim()
    if (!t) return
    this.logBuffer.push(t)
    if (this.logBuffer.length > 80) this.logBuffer.shift()
  }

  async launch(options: {
    versionId: string
    username?: string
    onProgress?: ProgressCallback
  }): Promise<{ success: true; pid: number; javaWarning?: string } | { success: false; error: string }> {
    try {
      if (this.isGameRunning()) {
        return { success: false, error: 'Minecraft ya esta en ejecucion' }
      }

      this.logBuffer = []
      const settings = this.settings.getSettings()
      const gameDir = settings.gameDir
      const versionId = options.versionId
      const username =
        (options.username || 'Player').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'Player'
      const uuid = offlineUUID(username)
      const accessToken = '0'

      await fs.promises.mkdir(gameDir, { recursive: true })

      const { versionJson } = await this.install.installVersion(versionId, gameDir, options.onProgress)
      const manifestMajor = Number(versionJson?.javaVersion?.majorVersion) || undefined

      options.onProgress?.({
        stage: 'java',
        current: 0,
        total: 1,
        message: 'Preparando Java...',
      })

      const required = this.java.requiredJavaMajor(versionId, manifestMajor)
      const { javaPath, major: javaMajor } = await this.runtimes.resolveForMinecraft(
        versionId,
        settings.javaPath,
        (msg, current, total) => {
          options.onProgress?.({
            stage: 'java',
            current: current || 0,
            total: total || 1,
            message: msg,
          })
        },
        manifestMajor
      )

      const javaVerStr = await this.java.getJavaVersion(javaPath)
      log.info('Using Java:', javaPath, javaVerStr, 'major=', javaMajor, 'required=', required)

      let agentArg: string | null = null
      try {
        const skinPath = this.skins.getActiveFilePath()
        options.onProgress?.({
          stage: 'skin',
          current: 0,
          total: 1,
          message: skinPath ? 'Preparando skin...' : 'Sin skin custom',
        })
        const skin = await skinServer.start({
          username,
          uuid,
          skinPath,
        })
        agentArg = skin.agentArg
        log.info('Skin agent:', agentArg)
      } catch (e: any) {
        log.warn('Skin server / authlib failed, launching without custom skin:', e.message)
      }

      const versionsDir = path.join(gameDir, 'versions', versionId)
      const clientJar = path.join(versionsDir, `${versionId}.jar`)
      const nativesDir = path.join(versionsDir, 'natives')
      const assetsDir = path.join(gameDir, 'assets')
      const librariesDir = path.join(gameDir, 'libraries')

      if (!fs.existsSync(clientJar)) {
        return { success: false, error: `No se encontro el cliente: ${clientJar}` }
      }

      const seen = new Set<string>()
      const classpathParts: string[] = []
      const addCp = (p: string) => {
        const n = path.normalize(p)
        if (seen.has(n)) return
        if (!fs.existsSync(n)) {
          log.warn('Missing library on classpath:', n)
          return
        }
        seen.add(n)
        classpathParts.push(n)
      }

      for (const lib of versionJson.libraries || []) {
        if (!rulesAllow(lib.rules)) continue
        if (lib.downloads?.artifact?.path) {
          addCp(path.join(librariesDir, lib.downloads.artifact.path))
        }
      }
      addCp(clientJar)

      const classpath = classpathParts.join(process.platform === 'win32' ? ';' : ':')

      const replacements: Record<string, string> = {
        '${auth_player_name}': username,
        '${version_name}': versionId,
        '${game_directory}': gameDir,
        '${assets_root}': assetsDir,
        '${game_assets}': path.join(assetsDir, 'virtual', 'legacy'),
        '${assets_index_name}': versionJson.assetIndex?.id || versionJson.assets || 'legacy',
        '${auth_uuid}': uuid,
        '${auth_access_token}': accessToken,
        '${auth_session}': accessToken,
        '${user_type}': 'msa',
        '${version_type}': versionJson.type || 'release',
        '${natives_directory}': nativesDir,
        '${launcher_name}': 'nexus-launcher',
        '${launcher_version}': '1.0.1',
        '${classpath}': classpath,
        '${user_properties}': '{}',
        '${clientid}': '0',
        '${auth_xuid}': '0',
        '${resolution_width}': '854',
        '${resolution_height}': '480',
      }

      const jvmArgs: string[] = [
        `-Xmx${settings.maxRam || 2048}M`,
        `-Xms${settings.minRam || 512}M`,
      ]

      if (agentArg) {
        jvmArgs.push(agentArg)
      }

      if (settings.jvmArgs?.trim()) {
        jvmArgs.push(...settings.jvmArgs.trim().split(/\s+/).filter(Boolean))
      }

      let hasCp = false
      let hasNatives = false

      if (versionJson.arguments?.jvm) {
        for (const arg of versionJson.arguments.jvm) {
          if (typeof arg === 'string') {
            const applied = applyTemplates(arg, replacements)
            if (!applied) continue
            if (applied === '-cp' || applied === '-classpath') hasCp = true
            if (applied.includes('java.library.path')) hasNatives = true
            jvmArgs.push(applied)
          } else if (arg && typeof arg === 'object' && arg.value) {
            if (!rulesAllow(arg.rules)) continue
            const values = Array.isArray(arg.value) ? arg.value : [arg.value]
            for (const v of values) {
              const applied = applyTemplates(String(v), replacements)
              if (!applied) continue
              if (applied === '-cp' || applied === '-classpath') hasCp = true
              if (applied.includes('java.library.path')) hasNatives = true
              jvmArgs.push(applied)
            }
          }
        }
      }

      if (!hasNatives) {
        jvmArgs.push(`-Djava.library.path=${nativesDir}`)
      }
      if (!hasCp) {
        jvmArgs.push('-cp', classpath)
      }

      const mainClass = versionJson.mainClass || 'net.minecraft.client.main.Main'

      const gameArgs: string[] = []
      if (versionJson.arguments?.game) {
        for (const arg of versionJson.arguments.game) {
          if (typeof arg === 'string') {
            const applied = applyTemplates(arg, replacements)
            if (applied) gameArgs.push(applied)
          } else if (arg && typeof arg === 'object' && arg.value) {
            if (!rulesAllow(arg.rules)) continue
            const values = Array.isArray(arg.value) ? arg.value : [arg.value]
            for (const v of values) {
              const applied = applyTemplates(String(v), replacements)
              if (applied) gameArgs.push(applied)
            }
          }
        }
      } else if (versionJson.minecraftArguments) {
        for (const part of String(versionJson.minecraftArguments).split(/\s+/)) {
          if (!part) continue
          const applied = applyTemplates(part, replacements)
          if (applied) gameArgs.push(applied)
        }
      }

      if (!gameArgs.includes('--version') && !gameArgs.includes('--username')) {
        gameArgs.push(
          '--username',
          username,
          '--version',
          versionId,
          '--gameDir',
          gameDir,
          '--assetsDir',
          assetsDir,
          '--assetIndex',
          versionJson.assetIndex?.id || versionJson.assets || 'legacy',
          '--uuid',
          uuid,
          '--accessToken',
          accessToken,
          '--userType',
          'msa'
        )
      }

      const fullArgs = [...jvmArgs, mainClass, ...gameArgs]
      log.info('Launch Java:', javaPath)
      log.info('Launch args:', fullArgs.join(' '))

      try {
        const cmdLog = path.join(versionsDir, 'last-launch.txt')
        await fs.promises.writeFile(cmdLog, `${javaPath}\n${fullArgs.join('\n')}\n`, 'utf-8')
      } catch {
        // ignore
      }

      options.onProgress?.({
        stage: 'launch',
        current: 1,
        total: 1,
        message: 'Iniciando Minecraft...',
      })

      this.launchedAt = Date.now()
      this.gameProcess = spawn(javaPath, fullArgs, {
        cwd: gameDir,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
        env: {
          ...process.env,
        },
      })

      const pid = this.gameProcess.pid
      if (!pid) {
        this.gameProcess = null
        await skinServer.stop().catch(() => {})
        return { success: false, error: 'No se pudo iniciar el proceso de Minecraft' }
      }

      this.gameProcess.stdout?.on('data', (d) => {
        const s = d.toString()
        log.info('[MC]', s.trim())
        this.pushLog(s)
      })
      this.gameProcess.stderr?.on('data', (d) => {
        const s = d.toString()
        log.warn('[MC]', s.trim())
        this.pushLog(s)
      })

      this.gameProcess.on('exit', (code) => {
        const elapsed = Date.now() - this.launchedAt
        const quickCrash = elapsed < 8000
        const logTail = this.logBuffer.slice(-40).join('\n')
        log.info('Minecraft exited', { code, elapsed, quickCrash })

        skinServer.stop().catch(() => {})

        try {
          const crashPath = path.join(versionsDir, 'last-crash.log')
          fs.writeFileSync(
            crashPath,
            `exitCode=${code}\nelapsedMs=${elapsed}\n\n${logTail}\n`,
            'utf-8'
          )
        } catch {
          // ignore
        }

        this.gameProcess = null

        let message: string | undefined
        if (quickCrash) {
          message =
            'Minecraft se cerro al instante. ' +
            (logTail ? 'Revisa el error abajo.' : 'Suele ser Java o natives.')
          if (
            logTail.toLowerCase().includes('unsupportedclassversion') ||
            logTail.includes('has been compiled by a more recent')
          ) {
            message = `Java demasiado viejo para esta version. Hace falta Java ${required}. Borra la carpeta java/${required} del launcher y reintenta.`
          } else if (
            logTail.toLowerCase().includes('unsatisfiedlinkerror') ||
            logTail.toLowerCase().includes('no lwjgl')
          ) {
            message =
              'Error de natives/LWJGL. Borra la carpeta natives de esa version y vuelve a jugar.'
          }
        }

        try {
          this.onGameExit?.({ code, quickCrash, logTail, message })
        } catch (e) {
          log.error('onGameExit error', e)
        }
      })

      this.gameProcess.on('error', (err) => {
        log.error('Minecraft process error', err)
        this.pushLog(String(err))
        this.gameProcess = null
        skinServer.stop().catch(() => {})
        try {
          this.onGameExit?.({
            code: 1,
            quickCrash: true,
            logTail: this.logBuffer.join('\n'),
            message: 'No se pudo ejecutar Java/Minecraft: ' + err.message,
          })
        } catch {
          // ignore
        }
      })

      try {
        this.settings.saveSettings({ selectedVersion: versionId })
      } catch {
        // ignore
      }

      return { success: true, pid }
    } catch (err: any) {
      log.error('Launch failed:', err)
      await skinServer.stop().catch(() => {})
      return { success: false, error: err.message || String(err) }
    }
  }
}

export const launchService = new LaunchService()
