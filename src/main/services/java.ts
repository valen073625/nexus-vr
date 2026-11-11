import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

const execFileAsync = promisify(execFile)

export class JavaService {
  async resolveJavaPath(configuredPath?: string): Promise<string> {
    if (configuredPath && configuredPath.trim()) {
      if (fs.existsSync(configuredPath)) return configuredPath
      log.warn('Configured Java path does not exist:', configuredPath)
    }

    if (process.env.JAVA_HOME) {
      const candidates =
        process.platform === 'win32'
          ? [
              path.join(process.env.JAVA_HOME, 'bin', 'java.exe'),
              path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'),
            ]
          : [path.join(process.env.JAVA_HOME, 'bin', 'java')]

      for (const c of candidates) {
        if (fs.existsSync(c)) return c
      }
    }

    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const binary = process.platform === 'win32' ? 'java.exe' : 'java'
    try {
      const { stdout } = await execFileAsync(cmd, [binary])
      const first = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean)
      if (first && fs.existsSync(first)) return first
    } catch {
      // ignore
    }

    throw new Error('No se encontro Java. El launcher lo descarga al jugar si falta.')
  }

  async getJavaVersion(javaPath: string): Promise<string> {
    try {
      const { stderr, stdout } = await execFileAsync(javaPath, ['-version'])
      const out = (stderr || stdout || '').toString()
      const match = out.match(/version "([^"]+)"/)
      return match ? match[1] : out.split('\n')[0] || 'unknown'
    } catch (err: any) {
      throw new Error(`No se pudo ejecutar Java: ${err.message}`)
    }
  }

  parseMajor(versionStr: string): number {
    const m1 = versionStr.match(/^1\.(\d+)/)
    if (m1) return Number(m1[1])
    const m2 = versionStr.match(/^(\d+)/)
    if (m2) return Number(m2[1])
    return 0
  }

  /**
   * Major que pide esa version de Minecraft.
   * Si el version.json trae javaVersion.majorVersion, ese manda.
   */
  requiredJavaMajor(mcVersionId: string, manifestMajor?: number): number {
    if (manifestMajor && manifestMajor >= 8) return manifestMajor

    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersionId)
    if (!m) return 17
    const major = Number(m[1])
    const minor = Number(m[2])
    const patch = Number(m[3] || 0)

    // Snapshots / 26+ y 1.21.11+ usan Java 25
    if (major >= 26) return 25
    if (major === 1 && minor === 21 && patch >= 11) return 25
    if (major > 1 && major < 26) return 21

    // 1.20.5+ -> Java 21
    if (major === 1 && (minor > 20 || (minor === 20 && patch >= 5))) return 21
    // 1.18 - 1.20.4 -> Java 17
    if (major === 1 && minor >= 18) return 17
    // 1.17 -> Java 16
    if (major === 1 && minor === 17) return 16
    // <= 1.16 -> Java 8
    return 8
  }
}
