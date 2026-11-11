import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

const execFileAsync = promisify(execFile)

export class JavaService {
  /**
   * Resuelve la ruta del ejecutable de Java.
   * Prioridad: setting del usuario > JAVA_HOME > PATH
   */
  async resolveJavaPath(configuredPath?: string): Promise<string> {
    if (configuredPath && configuredPath.trim()) {
      if (fs.existsSync(configuredPath)) return configuredPath
      log.warn('Configured Java path does not exist:', configuredPath)
    }

    if (process.env.JAVA_HOME) {
      const candidates = process.platform === 'win32'
        ? [
            path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'),
            path.join(process.env.JAVA_HOME, 'bin', 'java.exe'),
          ]
        : [path.join(process.env.JAVA_HOME, 'bin', 'java')]

      for (const c of candidates) {
        if (fs.existsSync(c)) return c
      }
    }

    // Buscar en PATH
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const binary = process.platform === 'win32' ? 'javaw.exe' : 'java'
    try {
      const { stdout } = await execFileAsync(cmd, [binary])
      const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      if (first && fs.existsSync(first)) return first
    } catch {
      // ignore
    }

    // Fallback común en Windows
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
        ]
        for (const root of roots) {
          if (!fs.existsSync(root)) continue
          const found = this.findJavaInDir(root)
          if (found) return found
        }
      }
    }

    throw new Error(
      'No se encontró Java. Instala Java 17+ y configúralo en Ajustes, o agrega JAVA_HOME al PATH.'
    )
  }

  private findJavaInDir(dir: string): string | null {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const javaw = path.join(dir, e.name, 'bin', 'javaw.exe')
        const java = path.join(dir, e.name, 'bin', 'java.exe')
        if (fs.existsSync(javaw)) return javaw
        if (fs.existsSync(java)) return java
      }
    } catch {
      // ignore
    }
    return null
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
}
