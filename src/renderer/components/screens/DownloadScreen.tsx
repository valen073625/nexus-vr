import React from 'react'
import { useStore } from '../../store/useStore'

const LABELS: Record<string, string> = {
  java: 'Java', client: 'Cliente de Minecraft', libraries: 'Librerías', assets: 'Recursos del juego',
  loader: 'Loader (Fabric/Forge...)', mods: 'Mods (optimización / FPS)', done: '¡Listo!',
}
const ORDER = ['java', 'client', 'libraries', 'assets', 'loader', 'mods', 'done']

function fmtBytes(b: number) {
  if (b > 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`
  if (b > 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

export function DownloadScreen() {
  const { downloadProgress: p } = useStore()
  const pct = p && p.total > 0 ? Math.min(100, Math.round((p.current / p.total) * 100)) : 0
  const cur = p ? ORDER.indexOf(p.phase) : -1

  return (
    <div className="download-screen">
      <div className="dl-hero">
        <img src="./logo.png" alt="" />
        <h2>{p ? LABELS[p.phase] ?? p.phase : 'Preparando...'}</h2>
        <p className="subtitle">Se descarga solo lo que falta. No cierres el launcher.</p>
      </div>
      <div className="card">
        <div className="progress-wrap">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="pct">{pct}%</span>
        </div>
        {p && (
          <>
            <div className="dl-stats">
              {p.phase !== 'java' && p.phase !== 'loader' && p.phase !== 'mods' && <span>{p.current} / {p.total}</span>}
              {p.totalBytes > 0 && p.phase === 'client' && <span>{fmtBytes(p.downloaded)} / {fmtBytes(p.totalBytes)}</span>}
            </div>
            {p.currentFile && <div className="current-file"><span className="cf-name">{p.currentFile}</span></div>}
          </>
        )}
        <div className="phases">
          {ORDER.slice(0, 6).map((ph, i) => {
            const cls = i === cur ? 'active' : i < cur ? 'done' : ''
            return <div key={ph} className={`phase ${cls}`}><span className="phase-dot">{cls === 'done' ? '✓' : cls === 'active' ? '●' : '○'}</span>{LABELS[ph]}</div>
          })}
        </div>
      </div>
    </div>
  )
}
