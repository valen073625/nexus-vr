import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store/useStore'

interface Version { id: string; type: string }

const DEFAULT_OPT = {
  enabled: false,
  renderDistance: 8,
  particles: 2,
  entityDistance: 0.5,
  maxFps: 260,
  vsync: false,
  mipmap: 0,
  clouds: false,
  fastGraphics: true,
  smoothLighting: false,
}

export function MainScreen() {
  const { activeProfile, setScreen, setDownloadProgress } = useStore()
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState('')
  const [showSnaps, setShowSnaps] = useState(false)
  const [maxRam, setMaxRam] = useState(2048)
  const [minRam, setMinRam] = useState(512)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [loadingV, setLoadingV] = useState(true)
  const [optOpen, setOptOpen] = useState(false)
  const [opt, setOpt] = useState(DEFAULT_OPT)

  useEffect(() => {
    (async () => {
      const s = await window.nexus.settings.get()
      setMaxRam(Number(s.maxRam) || 2048)
      setMinRam(Number(s.minRam) || 512)
      if (s.showSnapshots) setShowSnaps(true)
      if (s.optimize) setOpt({ ...DEFAULT_OPT, ...s.optimize })
      setLoadingV(true)
      try {
        const r = await window.nexus.versions.getManifest()
        if (r.success && r.manifest) {
          setVersions(r.manifest.versions)
          setSelected(s.selectedVersion || r.manifest.latest.release)
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

  function persistOpt(next: typeof opt) {
    setOpt(next)
    window.nexus.settings.save({ optimize: next })
  }

  const handlePlay = useCallback(async () => {
    if (!selected || !activeProfile) return
    setLaunching(true)
    setError('')
    const ram = Math.max(512, maxRam)
    const min = Math.min(minRam, ram)
    await window.nexus.settings.save({ maxRam: ram, minRam: min, selectedVersion: selected })
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
          maxRam: ram,
          minRam: min,
          jvmArgs: s.jvmArgs,
        },
        optimize: opt.enabled ? opt : undefined,
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
  }, [selected, activeProfile, setScreen, setDownloadProgress, maxRam, minRam, opt])

  const filtered = versions.filter(v => showSnaps || v.type === 'release').slice(0, 80)

  return (
    <div className="main-screen">
      <div className="screen-header">
        <h2>Jugar</h2>
        {activeProfile && (
          <div className="profile-pill">
            <span className="pill-name">{activeProfile.username}</span>
            <span className={`pill-badge ${activeProfile.type}`}>
              {activeProfile.type === 'microsoft' ? 'Premium' : 'Offline'}
            </span>
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Version</h3>
          <button className="btn-sec" onClick={() => setOptOpen(v => !v)}>Optimizar</button>
        </div>
        {loadingV ? (
          <div className="loading-row">Cargando versiones...</div>
        ) : (
          <>
            <select className="select" value={selected} onChange={e => {
              setSelected(e.target.value)
              window.nexus.settings.save({ selectedVersion: e.target.value })
            }}>
              {filtered.map(v => (
                <option key={v.id} value={v.id}>{v.id}{v.type !== 'release' ? ` (${v.type})` : ''}</option>
              ))}
            </select>
            <label className="checkbox">
              <input type="checkbox" checked={showSnaps} onChange={e => {
                setShowSnaps(e.target.checked)
                window.nexus.settings.save({ showSnapshots: e.target.checked })
              }} />
              Mostrar snapshots
            </label>
          </>
        )}
      </div>

      {optOpen && (
        <div className="card">
          <h3>Optimizacion</h3>
          <p className="card-desc">Solo ajustes del juego (FPS y distancia). No cambia el combate ni da ventaja ilegal. Se escriben en options.txt al pulsar Jugar.</p>
          <label className="checkbox">
            <input type="checkbox" checked={opt.enabled} onChange={e => persistOpt({ ...opt, enabled: e.target.checked })} />
            Activar al jugar esta sesion
          </label>
          <label>Distancia de render: {opt.renderDistance}</label>
          <input className="slider" type="range" min={2} max={16} value={opt.renderDistance} onChange={e => persistOpt({ ...opt, renderDistance: Number(e.target.value) })} />
          <label>Particulas (2 = minimas): {opt.particles}</label>
          <input className="slider" type="range" min={0} max={2} value={opt.particles} onChange={e => persistOpt({ ...opt, particles: Number(e.target.value) })} />
          <label>Distancia de entidades: {opt.entityDistance}</label>
          <input className="slider" type="range" min={0.5} max={1} step={0.25} value={opt.entityDistance} onChange={e => persistOpt({ ...opt, entityDistance: Number(e.target.value) })} />
          <label>FPS maximos: {opt.maxFps}</label>
          <input className="slider" type="range" min={60} max={260} step={10} value={opt.maxFps} onChange={e => persistOpt({ ...opt, maxFps: Number(e.target.value) })} />
          <label className="checkbox"><input type="checkbox" checked={opt.fastGraphics} onChange={e => persistOpt({ ...opt, fastGraphics: e.target.checked })} /> Graficos rapidos</label>
          <label className="checkbox"><input type="checkbox" checked={!opt.vsync} onChange={e => persistOpt({ ...opt, vsync: !e.target.checked })} /> Sin VSync</label>
          <label className="checkbox"><input type="checkbox" checked={!opt.clouds} onChange={e => persistOpt({ ...opt, clouds: !e.target.checked })} /> Sin nubes</label>
          <label className="checkbox"><input type="checkbox" checked={!opt.smoothLighting} onChange={e => persistOpt({ ...opt, smoothLighting: !e.target.checked })} /> Sin iluminacion suave</label>
        </div>
      )}

      <div className="card">
        <h3>Memoria RAM</h3>
        <div className="ram-row">
          <input type="range" min={512} max={16384} step={512} value={maxRam} className="slider"
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              setMaxRam(v)
              window.nexus.settings.save({ maxRam: v, minRam: Math.min(minRam, v) })
            }} />
          <span className="ram-label">{maxRam >= 1024 ? `${(maxRam / 1024).toFixed(1)} GB` : `${maxRam} MB`}</span>
        </div>
      </div>

      {activeProfile?.type === 'offline' && (
        <div className="alert warn">
          Modo offline: no entra a servidores con online-mode=true. La skin se aplica en singleplayer y LAN.
        </div>
      )}

      <button className="play-btn" onClick={handlePlay} disabled={launching || !selected || loadingV}>
        {launching ? 'Iniciando...' : 'JUGAR'}
      </button>
    </div>
  )
}
