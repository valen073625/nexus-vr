import React, { useEffect, useState } from 'react'

type ProgressInfo = {
  stage: string
  current: number
  total: number
  message: string
}

export default function App() {
  const [username, setUsername] = useState('Player')
  const [versionId] = useState('1.19.1')
  const [status, setStatus] = useState('Listo')
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPid, setLastPid] = useState<number | null>(null)

  useEffect(() => {
    const unsubscribe = window.nexus.onLaunchProgress((info) => {
      setProgress(info)
      setStatus(info.message)
    })
    return unsubscribe
  }, [])

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null

  async function handleLaunch() {
    setBusy(true)
    setError(null)
    setLastPid(null)
    setStatus('Preparando...')
    try {
      const result = await window.nexus.launchGame({
        versionId,
        username: username.trim() || 'Player',
      })
      if (result.success) {
        setStatus('Minecraft iniciado')
        setLastPid(result.pid)
        setProgress({ stage: 'done', current: 1, total: 1, message: 'Juego en ejecución' })
      } else {
        setError(result.error || 'Error desconocido')
        setStatus('Error')
      }
    } catch (e: any) {
      setError(e?.message || String(e))
      setStatus('Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Nexus Launcher</h1>
        <p className="subtitle">Minecraft: Java Edition</p>
      </header>

      <main className="main">
        <section className="card launch-card">
          <h2>Jugar</h2>

          <label className="field">
            <span>Usuario (offline)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={16}
              disabled={busy}
              placeholder="Player"
            />
          </label>

          <label className="field">
            <span>Versión</span>
            <input value={versionId} disabled />
          </label>

          <p className="hint">
            Modo offline: sirve para singleplayer. Necesitas <strong>Java 17+</strong> instalado.
            La primera vez descarga cliente, librerías y assets (~500MB+).
          </p>

          <button className="play-btn" onClick={handleLaunch} disabled={busy}>
            {busy ? 'Trabajando...' : 'Jugar 1.19.1'}
          </button>

          <div className="status-block">
            <div className="status-line">{status}</div>
            {percent !== null && (
              <div className="progress">
                <div className="progress-bar" style={{ width: `${percent}%` }} />
              </div>
            )}
            {progress && (
              <div className="progress-meta">
                {progress.stage} {percent !== null ? `${percent}%` : ''}
              </div>
            )}
            {lastPid && <div className="ok">PID: {lastPid}</div>}
            {error && <div className="error">{error}</div>}
          </div>
        </section>

        <section className="card">
          <h2>Notas</h2>
          <ul>
            <li>Versión fija: 1.19.1</li>
            <li>Autenticación offline (sin Microsoft aún)</li>
            <li>Los archivos se guardan en el directorio del juego (settings)</li>
            <li>Multiplayer online premium requiere login Microsoft (próximo paso)</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
