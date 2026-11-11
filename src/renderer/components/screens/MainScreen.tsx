import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store/useStore'

interface Version { id: string; type: string; releaseTime: string }

export function MainScreen() {
  const { activeProfile, setScreen, setDownloadProgress } = useStore()
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState('')
  const [showSnaps, setShowSnaps] = useState(false)
  const [maxRam, setMaxRam] = useState(2048)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [loadingV, setLoadingV] = useState(true)
  const [settings, setSettings] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const s = await window.nexus.settings.get()
      setSettings(s)
      setMaxRam(s.maxRam ?? 2048)
      if (s.showSnapshots) setShowSnaps(true)

      setLoadingV(true)
      try {
        const r = await window.nexus.versions.getManifest()
        if (r.success && r.manifest) {
          setVersions(r.manifest.versions)
          const sel = s.selectedVersion || r.manifest.latest.release
          setSelected(sel)
        } else {
          setError('No se pudo cargar las versiones: ' + (r.error ?? ''))
        }
      } catch (e: any) {
        setError('Error de red: ' + e.message)
      } finally {
        setLoadingV(false)
      }
    })()
  }, [])

  const handlePlay = useCallback(async () => {
    if (!selected || !activeProfile) return
    setLaunching(true)
    setError('')

    const s = await window.nexus.settings.get()

    const unsub = window.nexus.on('download:progress', (progress: any) => {
      setDownloadProgress(progress)
      if (progress.phase !== 'done') setScreen('download')
      else { setScreen('main'); setDownloadProgress(null) }
    })

    try {
      const result = await window.nexus.launcher.launch({
        versionId: selected,
        profileType: activeProfile.type,
        profileData: {
          username: activeProfile.username,
          uuid: activeProfile.uuid,
          accessToken: activeProfile.accessToken,
        },
        settings: {
          gameDir: s.gameDir,
          javaPath: s.javaPath,
          maxRam: s.maxRam,
          minRam: s.minRam,
          jvmArgs: s.jvmArgs,
        },
      })

      if (!result.success) {
        setError(result.error ?? 'Error al lanzar Minecraft.')
        setScreen('main')
        setDownloadProgress(null)
      }
    } finally {
      setLaunching(false)
      if (unsub) unsub()
    }
  }, [selected, activeProfile, setScreen, setDownloadProgress])

  const filtered = versions.filter(v => showSnaps || v.type === 'release').slice(0, 50)

  return (
    <div className="main-screen">
      <div className="screen-header">
        <h2>🎮 Jugar</h2>
        {activeProfile && (
          <div className="profile-pill">
            <span className="pill-name">{activeProfile.username}</span>
            <span className={`pill-badge ${activeProfile.type}`}>
              {activeProfile.type === 'microsoft' ? '⭐ Premium' : '🔒 Offline'}
            </span>
          </div>
        )}
      </div>

      {error && <div className="alert error">❌ {error}</div>}

      <div className="card">
        <h3>📦 Versión de Minecraft</h3>
        {loadingV ? (
          <div className="loading-row"><span className="spin">⟳</span> Cargando versiones...</div>
        ) : (
          <>
            <select
              className="select"
              value={selected}
              onChange={e => { setSelected(e.target.value); window.nexus.settings.save({ selectedVersion: e.target.value }) }}
            >
              {filtered.map(v => (
                <option key={v.id} value={v.id}>
                  {v.id}{v.type !== 'release' ? ` (${v.type})` : ''}
                </option>
              ))}
            </select>
            <label className="checkbox">
              <input type="checkbox" checked={showSnaps}
                onChange={e => { setShowSnaps(e.target.checked); window.nexus.settings.save({ showSnapshots: e.target.checked }) }} />
              Mostrar snapshots y versiones antiguas
            </label>
          </>
        )}
      </div>

      <div className="card">
        <h3>💾 Memoria RAM</h3>
        <div className="ram-row">
          <input type="range" min={512} max={16384} step={512} value={maxRam}
            className="slider"
            onChange={e => { const v = parseInt(e.target.value); setMaxRam(v); window.nexus.settings.save({ maxRam: v }) }} />
          <span className="ram-label">
            {maxRam >= 1024 ? `${(maxRam / 1024).toFixed(1)} GB` : `${maxRam} MB`}
          </span>
        </div>
      </div>

      {activeProfile?.type === 'offline' && (
        <div className="alert warn">
          ⚠️ <strong>Modo offline:</strong> No podrás conectarte a servidores con
          autenticación online. Solo funciona en singleplayer, LAN y servidores con{' '}
          <code>online-mode=false</code>.
        </div>
      )}

      <button
        className="play-btn"
        onClick={handlePlay}
        disabled={launching || !selected || loadingV}
      >
        {launching ? '⏳ Iniciando...' : '▶ JUGAR'}
      </button>
    </div>
  )
}
