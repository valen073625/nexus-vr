import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import log from 'electron-log'
import { SettingsService } from './settings'
import { JavaService } from './java'
import { InstallService, ProgressCallback } from './install'

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

export type GameExitCallback = (code: number | null) => void

export class LaunchService {
  private settings = new SettingsService()
  private java = new JavaService()
  private install = new InstallService()
  private gameProcess: ChildProcess | null = null
  private onGameExit: GameExitCallback | null = null

  setOnGameExit(cb: GameExitCallback | null) {
    this.onGameExit = cb
  }

  isGameRunning(): boolean {
    return this.gameProcess !== null && this.gameProcess.exitCode === null
  }

  async launch(options: {
    versionId: string
    username?: string
    onProgress?: ProgressCallback
  }): Promise<{ success: true; pid: number } | { success: false; error: string }> {
    try {
      if (this.isGameRunning()) {
        return { success: false, error: 'Minecraft ya está en ejecución' }
      }

      const settings = this.settings.getSettings()
      const gameDir = settings.gameDir
      const versionId = options.versionId
      const username = (options.username || 'Player').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'Player'
      const uuid = offlineUUID(username)
      const accessToken = '0'

      await fs.promises.mkdir(gameDir, { recursive: true })

      const { versionJson } = await this.install.installVersion(versionId, gameDir, options.onProgress)

      options.onProgress?.({
        stage: 'java',
        current: 0,
        total: 1,
        message: 'Buscando Java...',
      })

      const javaPath = await this.java.resolveJavaPath(settings.javaPath)
      const javaVer = await this.java.getJavaVersion(javaPath)
      log.info('Using Java:', javaPath, javaVer)

      const versionsDir = path.join(gameDir, 'versions', versionId)
      const clientJar = path.join(versionsDir, `${versionId}.jar`)
      const nativesDir = path.join(versionsDir, 'natives')
      const assetsDir = path.join(gameDir, 'assets')
      const librariesDir = path.join(gameDir, 'libraries')

      const classpathParts: string[] = []
      for (const lib of versionJson.libraries || []) {
        if (!lib.downloads?.artifact) continue
        if (lib.rules) {
          let allowed = false
          for (const rule of lib.rules) {
            let match = true
            if (rule.os?.name) {
              const osMap: Record<string, string> = { win32: 'windows', darwin: 'osx', linux: 'linux' }
              if (rule.os.name !== osMap[process.platform]) match = false
            }
            if (match) allowed = rule.action === 'allow'
          }
          if (!allowed) continue
        }
        const artifactPath = path.join(librariesDir, lib.downloads.artifact.path)
        if (fs.existsSync(artifactPath)) {
          classpathParts.push(artifactPath)
        }
      }
      classpathParts.push(clientJar)
      const classpath = classpathParts.join(process.platform === 'win32' ? ';' : ':')

      const replacements: Record<string, string> = {
        '${auth_player_name}': username,
        '${version_name}': versionId,
        '${game_directory}': gameDir,
        '${assets_root}': assetsDir,
        '${assets_index_name}': versionJson.assetIndex?.id || versionJson.assets || 'legacy',
        '${auth_uuid}': uuid,
        '${auth_access_token}': accessToken,
        '${user_type}': 'legacy',
        '${version_type}': versionJson.type || 'release',
        '${natives_directory}': nativesDir,
        '${launcher_name}': 'nexus-launcher',
        '${launcher_version}': '1.0.0',
        '${classpath}': classpath,
        '${user_properties}': '{}',
        '${clientid}': '',
        '${auth_xuid}': '',
      }

      const jvmArgs: string[] = [
        `-Xmx${settings.maxRam}M`,
        `-Xms${settings.minRam}M`,
        `-Djava.library.path=${nativesDir}`,
        `-Dminecraft.launcher.brand=nexus-launcher`,
        `-Dminecraft.launcher.version=1.0.0`,
      ]

      if (settings.jvmArgs?.trim()) {
        jvmArgs.push(...settings.jvmArgs.trim().split(/\s+/).filter(Boolean))
      }

      if (versionJson.arguments?.jvm) {
        for (const arg of versionJson.arguments.jvm) {
          if (typeof arg === 'string') {
            const applied = applyTemplates(arg, replacements)
            if (applied) jvmArgs.push(applied)
          } else if (arg && typeof arg === 'object' && arg.value) {
            let allow = true
            if (arg.rules) {
              allow = false
              for (const rule of arg.rules) {
                let match = true
                if (rule.os?.name) {
                  const osMap: Record<string, string> = { win32: 'windows', darwin: 'osx', linux: 'linux' }
                  if (rule.os.name !== osMap[process.platform]) match = false
                }
                if (rule.os?.arch && rule.os.arch !== process.arch) match = false
                if (match && rule.action === 'allow') allow = true
                if (match && rule.action === 'disallow') allow = false
              }
            }
            if (!allow) continue
            const values = Array.isArray(arg.value) ? arg.value : [arg.value]
            for (const v of values) {
              const applied = applyTemplates(String(v), replacements)
              if (applied) jvmArgs.push(applied)
            }
          }
        }
      } else {
        jvmArgs.push('-cp', classpath)
      }

      if (!jvmArgs.some((a) => a === '-cp' || a === '-classpath')) {
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
            let allow = true
            if (arg.rules) {
              allow = false
              for (const rule of arg.rules) {
                if (rule.features) {
                  allow = false
                  break
                }
                if (rule.action === 'allow') allow = true
              }
            }
            if (!allow) continue
            const values = Array.isArray(arg.value) ? arg.value : [arg.value]
            for (const v of values) {
              const applied = applyTemplates(String(v), replacements)
              if (applied) gameArgs.push(applied)
            }
          }
        }
      } else if (versionJson.minecraftArguments) {
        for (const part of versionJson.minecraftArguments.split(' ')) {
          const applied = applyTemplates(part, replacements)
          if (applied) gameArgs.push(applied)
        }
      }

      const fullArgs = [...jvmArgs, mainClass, ...gameArgs]
      log.info('Launch command:', javaPath, fullArgs.join(' '))

      options.onProgress?.({
        stage: 'launch',
        current: 1,
        total: 1,
        message: 'Iniciando Minecraft...',
      })

      // Sin detached/unref: necesitamos detectar el cierre del juego
      this.gameProcess = spawn(javaPath, fullArgs, {
        cwd: gameDir,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
        env: { ...process.env },
      })

      const pid = this.gameProcess.pid
      if (!pid) {
        this.gameProcess = null
        return { success: false, error: 'No se pudo iniciar el proceso de Minecraft' }
      }

      this.gameProcess.stdout?.on('data', (d) => log.info('[MC]', d.toString().trim()))
      this.gameProcess.stderr?.on('data', (d) => log.warn('[MC]', d.toString().trim()))

      this.gameProcess.on('exit', (code) => {
        log.info('Minecraft exited with code', code)
        this.gameProcess = null
        try {
          this.onGameExit?.(code)
        } catch (e) {
          log.error('onGameExit error', e)
        }
      })

      this.gameProcess.on('error', (err) => {
        log.error('Minecraft process error', err)
        this.gameProcess = null
        try {
          this.onGameExit?.(1)
        } catch {
          // ignore
        }
      })

      // Guardar última versión elegida
      try {
        this.settings.saveSettings({ selectedVersion: versionId })
      } catch {
        // ignore
      }

      return { success: true, pid }
    } catch (err: any) {
      log.error('Launch failed:', err)
      return { success: false, error: err.message || String(err) }
    }
  }
}

/** Singleton compartido entre IPC y main */
export const launchService = new LaunchService()
