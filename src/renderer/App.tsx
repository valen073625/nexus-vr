import React, { useEffect, useMemo, useState } from 'react'

type ProgressInfo = {
  stage: string
  current: number
  total: number
  message: string
}

type VersionItem = {
  id: string
  type: string
  releaseTime: string
}

export default function App() {
  const [username, setUsername] = useState('Player')
  const [versionId, setVersionId] = useState('1.19.1')
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [latest, setLatest] = useState<string>('')
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [status, setStatus] = useState('Listo')
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubProgress = window.nexus.onLaunchProgress((info) => {
      setProgress(info)
      setStatus(info.message)
    })
    const unsubExit = window.nexus.onGameExited(() => {
      setBusy(false)
      setStatus('Minecraft cerrado — launcher listo')
      setProgress(null)
    })
    return () => {
      unsubProgress()
      unsubExit()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setVersionsLoading(true)
      setVersionsError(null)
      try {
        const [playable, settings] = await Promise.all([
          window.nexus.getPlayableVersions(),
          window.nexus.getSettings(),
        ])
        if (cancelled) return

        if (!playable.success) {
          setVersionsError(playable.error || 'No se pudieron cargar versiones')
          return
        }

        setVersions(playable.versions || [])
        setLatest(playable.latest || '')

        const preferred =
          settings?.selectedVersion ||
          playable.latest ||
          playable.versions?.[0]?.id ||
          '1.19.1'

        const exists = (playable.versions || []).some((v: VersionItem) => v.id === preferred)
        setVersionId(exists ? preferred : playable.versions?.[0]?.id || '1.19.1')

        if (settings?.username) {
          // no username in settings yet — ignore
        }
      } catch (e: any) {
        if (!cancelled) setVersionsError(e?.message || String(e))
      } finally {
        if (!cancelled) setVersionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null

  const versionLabel = useMemo(() => versionId || '—', [versionId])

  async function handleLaunch() {
    if (!versionId) {
      setError('Selecciona una versión')
      return
    }
    setBusy(true)
    setError(null)
    setStatus('Preparando...')
    try {
      const result = await window.nexus.launchGame({
        versionId,
        username: username.trim() || 'Player',
      })
      if (result.success) {
        setStatus('Minecraft iniciado')
        setProgress({ stage: 'done', current: 1, total: 1, message: 'Juego en ejecución' })
        // Ocultar launcher; se reabre al cerrar el juego
        window.nexus.hideLauncherWindow()
      } else {
        setError(result.error || 'Error desconocido')
        setStatus('Error')
        setBusy(false)
      }
    } catch (e: any) {
      setError(e?.message || String(e))
      setStatus('Error')
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
            <span>Versión {latest ? `(última: ${latest})` : ''}</span>
            {versionsLoading ? (
              <div className="hint">Cargando versiones...</div>
            ) : versionsError ? (
              <div className="error">{versionsError}</div>
            ) : (
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                disabled={busy || versions.length === 0}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                    {v.id === latest ? ' — última' : ''}
                  </option>
                ))}
              </select>
            )}
          </label>

          <p className="hint">
            Releases desde <strong>1.8.9</strong> hasta la última. Modo offline (singleplayer).
            Versiones recientes necesitan <strong>Java 17+</strong>; las muy antiguas (1.8–~1.16)
            pueden requerir Java 8.
          </p>

          <button className="play-btn" onClick={handleLaunch} disabled={busy || versionsLoading}>
            {busy ? 'Trabajando...' : `Jugar ${versionLabel}`}
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
            {error && <div className="error">{error}</div>}
          </div>
        </section>

        <section className="card">
          <h2>Comportamiento</h2>
          <ul>
            <li>Al jugar, el launcher se oculta</li>
            <li>Al cerrar Minecraft, el launcher vuelve a abrirse</li>
            <li>La primera vez descarga esa versión (puede tardar)</li>
            <li>Login Microsoft aún no implementado</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
