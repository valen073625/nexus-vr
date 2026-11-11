import React from 'react'
import { useStore } from '../../store/useStore'

const PHASE_LABELS: Record<string, string> = {
  client: 'Cliente de Minecraft',
  libraries: 'Librerias',
  assets: 'Recursos',
  java: 'Java',
  done: 'Listo',
}

export function DownloadScreen() {
  const { downloadProgress } = useStore()
  if (!downloadProgress) {
    return <div className="download-screen"><div className="loading-row big">Preparando descarga...</div></div>
  }
  const { phase, current, total, currentFile } = downloadProgress
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="download-screen">
      <div className="screen-header">
        <h2>Descargando</h2>
        <p className="subtitle">{PHASE_LABELS[phase] ?? phase}</p>
      </div>
      <div className="card">
        <div className="progress-wrap">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="pct">{pct}%</span>
        </div>
        <div className="dl-stats"><span>{current} / {total}</span></div>
        {currentFile && <div className="current-file"><span className="cf-name">{currentFile}</span></div>}
      </div>
    </div>
  )
}
