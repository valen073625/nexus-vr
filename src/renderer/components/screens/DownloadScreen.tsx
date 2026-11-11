import React from 'react'
import { useStore } from '../../store/useStore'

const PHASE_LABELS: Record<string, string> = {
  client:    'Descargando cliente de Minecraft',
  libraries: 'Descargando librerías',
  assets:    'Descargando recursos del juego',
  java:      'Descargando Java Runtime',
  done:      '¡Listo!',
}

function fmtBytes(b: number) {
  if (b > 1024**3) return `${(b/1024**3).toFixed(2)} GB`
  if (b > 1024**2) return `${(b/1024**2).toFixed(1)} MB`
  if (b > 1024)    return `${(b/1024).toFixed(0)} KB`
  return `${b} B`
}

function fmtSpeed(b: number) {
  if (b > 1024**2) return `${(b/1024**2).toFixed(1)} MB/s`
  if (b > 1024)    return `${(b/1024).toFixed(0)} KB/s`
  return `${b} B/s`
}

export function DownloadScreen() {
  const { downloadProgress } = useStore()

  if (!downloadProgress) {
    return (
      <div className="download-screen">
        <div className="loading-row big">
          <span className="spin">⟳</span>
          <span>Preparando descarga...</span>
        </div>
      </div>
    )
  }

  const { phase, current, total, currentFile, speed, downloaded, totalBytes } = downloadProgress
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const phases = ['client', 'libraries', 'assets', 'java']

  return (
    <div className="download-screen">
      <div className="screen-header">
        <h2>⬇️ Descargando Minecraft</h2>
        <p className="subtitle">{PHASE_LABELS[phase] ?? phase}</p>
      </div>

      <div className="card">
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="pct">{pct}%</span>
        </div>

        <div className="dl-stats">
          {speed > 0 && <span>🚀 {fmtSpeed(speed)}</span>}
          <span>📁 {current} / {total} archivos</span>
          {totalBytes > 0 && <span>💾 {fmtBytes(downloaded)} / {fmtBytes(totalBytes)}</span>}
        </div>

        {currentFile && (
          <div className="current-file">
            <span className="cf-label">Archivo:</span>
            <span className="cf-name">{currentFile}</span>
          </div>
        )}

        <div className="phases">
          {phases.map(p => {
            const order = ['client','libraries','assets','java','done']
            const iCur = order.indexOf(phase)
            const iP   = order.indexOf(p)
            const cls  = p === phase ? 'active' : iP < iCur ? 'done' : 'pending'
            return (
              <div key={p} className={`phase ${cls}`}>
                <span className="phase-dot">{cls === 'done' ? '✓' : cls === 'active' ? '●' : '○'}</span>
                <span>{PHASE_LABELS[p]}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
