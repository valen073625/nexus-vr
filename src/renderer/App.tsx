import React, { useCallback, useEffect, useMemo, useState } from 'react'
import SkinPreview from './components/SkinPreview'

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

type SkinInfo = {
  id: string
  name: string
  fileName: string
  createdAt: string
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

  const [skins, setSkins] = useState<SkinInfo[]>([])
  const [activeSkinId, setActiveSkinId] = useState<string | null>(null)
  const [skinDataUrl, setSkinDataUrl] = useState<string | null>(null)
  const [skinBusy, setSkinBusy] = useState(false)
  const [skinMsg, setSkinMsg] = useState<string | null>(null)

  const refreshSkins = useCallback(async () => {
    const list = await window.nexus.listSkins()
    setSkins(list.skins || [])
    setActiveSkinId(list.activeId || null)
    if (list.activeId) {
      const url = await window.nexus.getSkinDataUrl(list.activeId)
      setSkinDataUrl(url)
    } else {
      setSkinDataUrl(null)
    }
  }, [])

  useEffect(() => {
    const unsubProgress = window.nexus.onLaunchProgress((info) => {
      setProgress(info)
      setStatus(info.message)
    })
    const unsubExit = window.nexus.onGameExited(() => {
      setBusy(false)
      setStatus('Minecraft cerrado \u2014 launcher listo')
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
      } catch (e: any) {
        if (!cancelled) setVersionsError(e?.message || String(e))
      } finally {
        if (!cancelled) setVersionsLoading(false)
      }
    })()
    refreshSkins().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshSkins])

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null

  const versionLabel = useMemo(() => versionId || '\u2014', [versionId])

  async function handleLaunch() {
    if (!versionId) {
      setError('Selecciona una versi\u00f3n')
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
        setProgress({ stage: 'done', current: 1, total: 1, message: 'Juego en ejecuci\u00f3n' })
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

  async function handleImportSkin() {
    setSkinBusy(true)
    setSkinMsg(null)
    try {
      const result = await window.nexus.importSkin()
      if (result.canceled) return
      if (!result.success) {
        setSkinMsg(result.error || 'No se pudo importar')
        return
      }
      setSkinMsg(`Skin "${result.skin.name}" agregada`)
      await refreshSkins()
    } catch (e: any) {
      setSkinMsg(e?.message || String(e))
    } finally {
      setSkinBusy(false)
    }
  }

  async function handleSelectSkin(id: string) {
    await window.nexus.setActiveSkin(id)
    await refreshSkins()
  }

  async function handleDeleteSkin(id: string) {
    await window.nexus.deleteSkin(id)
    await refreshSkins()
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Nexus Launcher</h1>
        <p className="subtitle">Minecraft: Java Edition</p>
      </header>

      <main className="main main-skins">
        {/* Columna skin */}
        <section className="card skin-card">
          <h2>Skin del jugador</h2>

          <div className="skin-layout">
            <div className="skin-stage">
              <SkinPreview
                dataUrl={skinDataUrl}
                username={username.trim() || 'Player'}
                size={180}
              />
            </div>

            <div className="skin-actions">
              <p className="hint skin-hint">
                Agrega una imagen PNG de skin (64\u00d764). Se guarda en el launcher y puedes cambiarla cuando quieras.
              </p>
              <button
                className="secondary-btn"
                onClick={handleImportSkin}
                disabled={skinBusy || busy}
              >
                {skinBusy ? 'Importando...' : 'Agregar imagen de la skin'}
              </button>
              {skinMsg && <div className="ok">{skinMsg}</div>}

              {skins.length > 0 && (
                <div className="skin-list">
                  <div className="skin-list-title">Skins guardadas</div>
                  {skins.map((s) => (
                    <div
                      key={s.id}
                      className={`skin-item ${s.id === activeSkinId ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="skin-item-name"
                        onClick={() => handleSelectSkin(s.id)}
                        disabled={busy}
                      >
                        {s.name}
                        {s.id === activeSkinId ? ' \u2713' : ''}
                      </button>
                      <button
                        type="button"
                        className="skin-item-del"
                        onClick={() => handleDeleteSkin(s.id)}
                        disabled={busy}
                        title="Eliminar"
                      >
                        \u00d7
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Columna jugar */}
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
            <span>Versi\u00f3n {latest ? `(\u00faltima: ${latest})` : ''}</span>
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
                    {v.id === latest ? ' \u2014 \u00faltima' : ''}
                  </option>
                ))}
              </select>
            )}
          </label>

          <p className="hint">
            Releases desde <strong>1.8.9</strong> hasta la \u00faltima. Al jugar el launcher se oculta y
            vuelve al cerrar Minecraft.
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
      </main>
    </div>
  )
}
