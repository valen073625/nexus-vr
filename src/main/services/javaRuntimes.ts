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

const KNOWN = [8, 16, 17, 21, 25] as const
type KnownMajor = (typeof KNOWN)[number]

function isKnown(major: number): major is KnownMajor {
  return (KNOWN as readonly number[]).includes(major)
}

export class JavaRuntimesService {
  private java = new JavaService()
  private root: string

  constructor() {
    this.root = path.join(app.getPath('userData'), 'java')
    fs.mkdirSync(this.root, { recursive: true })
  }

  /** Borra solo los JRE que bajo el launcher. No toca el Java del sistema. */
  deleteDownloaded(): { path: string } {
    if (fs.existsSync(this.root)) {
      fs.rmSync(this.root, { recursive: true, force: true })
    }
    fs.mkdirSync(this.root, { recursive: true })
    log.info('Javas descargados eliminados:', this.root)
    return { path: this.root }
  }

  private runtimeDir(major: number): string {
    return path.join(this.root, String(major))
  }

  private findJavaBinary(dir: string): string | null {
    if (!fs.existsSync(dir)) return null
    const walk = (d: string, depth: number): string | null => {
      if (depth > 5) return null
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

  private async collectCandidates(): Promise<string[]> {
    const candidates: string[] = []
    const push = (p: string) => {
      if (p && fs.existsSync(p) && !candidates.includes(p)) candidates.push(p)
    }

    if (process.env.JAVA_HOME) {
      push(
        process.platform === 'win32'
          ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
          : path.join(process.env.JAVA_HOME, 'bin', 'java')
      )
    }

    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const bin = process.platform === 'win32' ? 'java.exe' : 'java'
      const { stdout } = await execFileAsync(cmd, [bin])
      for (const line of stdout.split(/\r?\n/)) push(line.trim())
    } catch {
      // ignore
    }

    if (process.platform === 'win32') {
      const bases = [
        process.env['ProgramFiles'],
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA,
        'C:\\Program Files',
        'C:\\Program Files (x86)',
      ].filter(Boolean) as string[]
      const vendors = ['Java', 'Eclipse Adoptium', 'Microsoft', 'Amazon Corretto', 'BellSoft', 'Zulu', 'Semeru']
      for (const base of bases) {
        for (const v of vendors) {
          const root = path.join(base, v)
          if (!fs.existsSync(root)) continue
          try {
            for (const name of fs.readdirSync(root)) {
              push(path.join(root, name, 'bin', 'java.exe'))
            }
          } catch {
            // ignore
          }
        }
      }
    }

    try {
      for (const name of fs.readdirSync(this.root)) {
        const bin = this.findJavaBinary(path.join(this.root, name))
        if (bin) push(bin)
      }
    } catch {
      // ignore
    }

    return candidates
  }

  async findInstalled(major: number): Promise<string | null> {
    for (const c of await this.collectCandidates()) {
      try {
        const ver = await this.java.getJavaVersion(c)
        if (this.java.parseMajor(ver) === major) return c
      } catch {
        // ignore
      }
    }
    return null
  }

  private adoptiumUrl(major: KnownMajor): string {
    const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
    if (major === 16) {
      return `https://api.adoptium.net/v3/binary/version/jdk-16.0.2+7/${os}/${arch}/jre/hotspot/normal/eclipse?project=jdk`
    }
    return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse?project=jdk`
  }

  async ensureRuntime(major: number, onProgress?: ProgressFn): Promise<string> {
    const existing = await this.findInstalled(major)
    if (existing) {
      onProgress?.(`Java ${major} ya esta instalado, no se vuelve a bajar`)
      return existing
    }
    if (!isKnown(major)) {
      throw new Error(`Esta version pide Java ${major} y el launcher no tiene un instalador para ese numero.`)
    }

    onProgress?.(`Descargando Java ${major} (solo esta vez)...`, 0, 1)
    const destDir = this.runtimeDir(major)
    const tmpZip = path.join(this.root, `java-${major}-download.zip`)
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })

    const url = this.adoptiumUrl(major)
    const response = await axios.get(url, { responseType: 'stream', timeout: 600000, maxRedirects: 10 })
    const total = Number(response.headers['content-length'] || 0)
    let downloaded = 0
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(tmpZip)
      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (total > 0) onProgress?.(`Descargando Java ${major}...`, downloaded, total)
      })
      response.data.pipe(writer)
      writer.on('finish', () => resolve())
      writer.on('error', reject)
      response.data.on('error', reject)
    })

    onProgress?.(`Extrayendo Java ${major}...`)
    await extract(tmpZip, { dir: destDir })
    try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }

    const bin = this.findJavaBinary(destDir)
    if (!bin) throw new Error(`No se encontro java.exe tras instalar Java ${major}`)
    const ver = await this.java.getJavaVersion(bin)
    if (this.java.parseMajor(ver) !== major) {
      throw new Error(`Se descargo Java ${ver}, pero se necesitaba Java ${major}`)
    }
    onProgress?.(`Java ${major} listo (${ver})`)
    return bin
  }

  async resolveForMinecraft(
    versionId: string,
    configuredPath: string | undefined,
    onProgress?: ProgressFn,
    manifestMajor?: number
  ): Promise<{ javaPath: string; major: number }> {
    const required = this.java.requiredJavaMajor(versionId, manifestMajor)
    if (configuredPath && fs.existsSync(configuredPath)) {
      try {
        const ver = await this.java.getJavaVersion(configuredPath)
        const major = this.java.parseMajor(ver)
        if (major === required || (major >= required && required >= 17 && major < required + 4)) {
          onProgress?.(`Usando el Java ${major} que configuraste`)
          return { javaPath: configuredPath, major }
        }
      } catch {
        // ignore
      }
    }
    const javaPath = await this.ensureRuntime(required, onProgress)
    const ver = await this.java.getJavaVersion(javaPath)
    return { javaPath, major: this.java.parseMajor(ver) }
  }
}
