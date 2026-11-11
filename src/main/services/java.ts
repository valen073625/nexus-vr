import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

const execFileAsync = promisify(execFile)

export class JavaService {
  /** Prefiere java.exe (con consola/logs) sobre javaw.exe */
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

    if (process.platform === 'win32') {
      const programFiles = [
        process.env['ProgramFiles'],
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA,
      ].filter(Boolean) as string[]

      for (const base of programFiles) {
        const roots = [
          path.join(base, 'Java'),
          path.join(base, 'Eclipse Adoptium'),
          path.join(base, 'Microsoft'),
          path.join(base, 'Amazon Corretto'),
          path.join(base, 'BellSoft'),
          path.join(base, 'Zulu'),
        ]
        for (const root of roots) {
          if (!fs.existsSync(root)) continue
          const found = this.findJavaInDir(root)
          if (found) return found
        }
      }
    }

    throw new Error(
      'No se encontro Java. Instala Java 17+ (o Java 21 para 1.20.5+) y agrega JAVA_HOME al PATH.'
    )
  }

  private findJavaInDir(dir: string): string | null {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      // Preferir versiones mas nuevas
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .reverse()

      for (const name of dirs) {
        const java = path.join(dir, name, 'bin', 'java.exe')
        const javaw = path.join(dir, name, 'bin', 'javaw.exe')
        if (fs.existsSync(java)) return java
        if (fs.existsSync(javaw)) return javaw
      }
    } catch {
      // ignore
    }
    return null
  }

  async getJavaVersion(javaPath: string): Promise<string> {
    try {
      // -version escribe en stderr
      const { stderr, stdout } = await execFileAsync(javaPath, ['-version'])
      const out = (stderr || stdout || '').toString()
      const match = out.match(/version "([^"]+)"/)
      return match ? match[1] : out.split('\n')[0] || 'unknown'
    } catch (err: any) {
      throw new Error(`No se pudo ejecutar Java: ${err.message}`)
    }
  }

  /** Major version: "17.0.9" -> 17, "1.8.0_372" -> 8 */
  parseMajor(versionStr: string): number {
    const m1 = versionStr.match(/^1\.(\d+)/)
    if (m1) return Number(m1[1])
    const m2 = versionStr.match(/^(\d+)/)
    if (m2) return Number(m2[1])
    return 0
  }

  /** Java minima recomendada segun version de Minecraft */
  requiredJavaMajor(mcVersionId: string): number {
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersionId)
    if (!m) return 17
    const major = Number(m[1])
    const minor = Number(m[2])
    const patch = Number(m[3] || 0)

    // 1.20.5+ -> Java 21
    if (major > 1 || (major === 1 && minor > 20) || (major === 1 && minor === 20 && patch >= 5)) {
      return 21
    }
    // 1.18+ -> Java 17
    if (major === 1 && minor >= 18) return 17
    // 1.17 -> Java 16+
    if (major === 1 && minor === 17) return 16
    // 1.12 - 1.16 -> Java 8
    return 8
  }
}
