import { app } from 'electron'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import extract from 'extract-zip'
import log from 'electron-log'
import { JavaService } from './java'

const execFileAsync = promisify(execFile)

export type ProgressFn = (msg: string, current?: number, total?: number) => void

/**
 * Gestiona Java 17 y 21: usa el del sistema si existe,
 * si no, descarga JRE portatil de Adoptium en userData.
 */
export class JavaRuntimesService {
  private java = new JavaService()
  private root: string

  constructor() {
    this.root = path.join(app.getPath('userData'), 'java')
    fs.mkdirSync(this.root, { recursive: true })
  }

  private runtimeDir(major: 17 | 21): string {
    return path.join(this.root, String(major))
  }

  private findJavaBinary(dir: string): string | null {
    if (!fs.existsSync(dir)) return null
    const walk = (d: string, depth: number): string | null => {
      if (depth > 4) return null
      try {
        const binJava = path.join(d, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
        if (fs.existsSync(binJava)) return binJava
        for (const name of fs.readdirSync(d)) {
          const full = path.join(d, name)
          try {
            if (fs.statSync(full).isDirectory()) {
              const found = walk(full, depth + 1)
              if (found) return found
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      return null
    }
    return walk(dir, 0)
  }

  /** Busca en sistema (PATH, JAVA_HOME, Program Files) un Java del major indicado */
  async findSystemJava(major: number): Promise<string | null> {
    const candidates: string[] = []

    if (process.env.JAVA_HOME) {
      const p =
        process.platform === 'win32'
          ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
          : path.join(process.env.JAVA_HOME, 'bin', 'java')
      if (fs.existsSync(p)) candidates.push(p)
    }

    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const bin = process.platform === 'win32' ? 'java.exe' : 'java'
      const { stdout } = await execFileAsync(cmd, [bin])
      for (const line of stdout.split(/\r?\n/)) {
        const t = line.trim()
        if (t && fs.existsSync(t)) candidates.push(t)
      }
    } catch {
      // ignore
    }

    if (process.platform === 'win32') {
      const bases = [
        process.env['ProgramFiles'],
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA,
      ].filter(Boolean) as string[]
      const vendors = ['Java', 'Eclipse Adoptium', 'Microsoft', 'Amazon Corretto', 'BellSoft', 'Zulu']
      for (const base of bases) {
        for (const v of vendors) {
          const root = path.join(base, v)
          if (!fs.existsSync(root)) continue
          try {
            for (const name of fs.readdirSync(root)) {
              const java = path.join(root, name, 'bin', 'java.exe')
              if (fs.existsSync(java)) candidates.push(java)
            }
          } catch {
            // ignore
          }
        }
      }
    }

    for (const c of candidates) {
      try {
        const ver = await this.java.getJavaVersion(c)
        if (this.java.parseMajor(ver) === major) {
          log.info(`System Java ${major} found:`, c, ver)
          return c
        }
      } catch {
        // ignore
      }
    }
    return null
  }

  async getBundledJava(major: 17 | 21): Promise<string | null> {
    const bin = this.findJavaBinary(this.runtimeDir(major))
    if (!bin) return null
    try {
      const ver = await this.java.getJavaVersion(bin)
      if (this.java.parseMajor(ver) === major) return bin
    } catch {
      // ignore
    }
    return null
  }

  private adoptiumUrl(major: 17 | 21): string {
    const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
    // JRE hotspot GA
    return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse?project=jdk`
  }

  async ensureRuntime(major: 17 | 21, onProgress?: ProgressFn): Promise<string> {
    // 1) Sistema
    const system = await this.findSystemJava(major)
    if (system) {
      onProgress?.(`Java ${major} del sistema encontrado`)
      return system
    }

    // 2) Ya descargado por el launcher
    const bundled = await this.getBundledJava(major)
    if (bundled) {
      onProgress?.(`Java ${major} local encontrado`)
      return bundled
    }

    // 3) Descargar
    onProgress?.(`Descargando Java ${major} (solo la primera vez)...`, 0, 1)
    const destDir = this.runtimeDir(major)
    const tmpZip = path.join(this.root, `java-${major}-download.zip`)

    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true })
    }
    fs.mkdirSync(destDir, { recursive: true })

    const url = this.adoptiumUrl(major)
    log.info('Downloading Java', major, url)

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 600000,
      maxRedirects: 10,
    })

    const total = Number(response.headers['content-length'] || 0)
    let downloaded = 0

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(tmpZip)
      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (total > 0) {
          onProgress?.(`Descargando Java ${major}...`, downloaded, total)
        }
      })
      response.data.pipe(writer)
      writer.on('finish', () => resolve())
      writer.on('error', reject)
      response.data.on('error', reject)
    })

    onProgress?.(`Extrayendo Java ${major}...`)
    await extract(tmpZip, { dir: destDir })
    try {
      fs.unlinkSync(tmpZip)
    } catch {
      // ignore
    }

    const bin = this.findJavaBinary(destDir)
    if (!bin) {
      throw new Error(`No se encontro java.exe tras instalar Java ${major}`)
    }

    const ver = await this.java.getJavaVersion(bin)
    log.info('Installed Java', major, bin, ver)
    onProgress?.(`Java ${major} listo (${ver})`)
    return bin
  }

  /**
   * Elige Java segun la version de Minecraft.
   * 1.20.5+ -> 21; resto moderno -> 17 (o 21 si hace falta).
   * Si el usuario configuro un Java manual, se respeta si cumple.
   */
  async resolveForMinecraft(
    versionId: string,
    configuredPath: string | undefined,
    onProgress?: ProgressFn
  ): Promise<{ javaPath: string; major: number }> {
    const required = this.java.requiredJavaMajor(versionId)
    const target: 17 | 21 = required >= 21 ? 21 : 17

    if (configuredPath && fs.existsSync(configuredPath)) {
      try {
        const ver = await this.java.getJavaVersion(configuredPath)
        const major = this.java.parseMajor(ver)
        if (major >= required) {
          return { javaPath: configuredPath, major }
        }
        log.warn('Configured Java too old, ignoring:', ver)
      } catch {
        // ignore
      }
    }

    // Para versiones que piden 8, igual usamos 17 con flags de compat
    const javaPath = await this.ensureRuntime(target, onProgress)
    const ver = await this.java.getJavaVersion(javaPath)
    return { javaPath, major: this.java.parseMajor(ver) }
  }
}
