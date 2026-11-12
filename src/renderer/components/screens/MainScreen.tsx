import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { IconPlay } from '../ui/Icons'

interface Version { id: string; type: string }
interface Inst { id: string; name: string; mcVersion: string; loader: string; modpack?: boolean }
type Loader = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

const LOADERS: { id: Loader; label: string }[] = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
]

const DEFAULT_OPT = {
  enabled: false, renderDistance: 8, particles: 2, entityDistance: 0.5, maxFps: 260,
  vsync: false, mipmap: 0, clouds: false, fastGraphics: true, smoothLighting: false,
}

function okVersion(v: Version) {
  const m = /^1\.(\d+)/.exec(v.id)
  return m ? Number(m[1]) >= 8 : true
}

export function MainScreen() {
  const { activeProfile, setScreen, setDownloadProgress } = useStore()
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState('')
  const [loader, setLoader] = useState<Loader>('vanilla')
  const [avail, setAvail] = useState<Record<string, boolean>>({})
  const [insts, setInsts] = useState<Inst[]>([])
  const [instId, setInstId] = useState<string | null>(null)
  const [showSnaps, setShowSnaps] = useState(false)
  const [maxRam, setMaxRam] = useState(2048)
  const [minRam, setMinRam] = useState(512)
  const [optimize, setOptimize] = useState(false)
  const [hud, setHud] = useState(false)
  const [opt, setOpt] = useState(DEFAULT_OPT)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [notices, setNotices] = useState<string[]>([])
  const [loadingV, setLoadingV] = useState(true)

  const refreshInsts = useCallback(() => window.nexus.instances.list().then(setInsts), [])

  useEffect(() => {
    (async () => {
      const s = await window.nexus.settings.get()
      setMaxRam(Number(s.maxRam) || 2048)
      setMinRam(Number(s.minRam) || 512)
      if (s.showSnapshots) setShowSnaps(true)
      if (s.optimize) { const o = { ...DEFAULT_OPT, ...s.optimize }; setOpt(o); setOptimize(!!o.enabled) }
      setHud(!!s.showHud)
      if (s.selectedLoader) setLoader(s.selectedLoader)
      refreshInsts()
      try {
        const r = await window.nexus.versions.getManifest()
        if (r.success && r.manifest) {
          setVersions(r.manifest.versions)
          setSelected(s.selectedVersion || r.manifest.latest.release)
        } else setError('No se pudo cargar las versiones: ' + (r.error ?? ''))
      } catch (e: any) { setError('Error de red: ' + e.message) }
      finally { setLoadingV(false) }
    })()
  }, [refreshInsts])

  // Qué loaders existen para la versión elegida
  useEffect(() => {
    if (!selected) return
    let alive = true
    setAvail({})
    window.nexus.loaders.availability(selected).then(r => {
      if (!alive || !r.success || !r.availability) return
      setAvail(r.availability)
      setLoader(cur => (cur !== 'vanilla' && !r.availability![cur as 'fabric'] ? 'vanilla' : cur))
    })
    return () => { alive = false }
  }, [selected])

  const inst = insts.find(i => i.id === instId) || null
  const effLoader: Loader = inst ? (inst.loader as Loader) : loader

  function pickVersion(v: string) { setSelected(v); setInstId(null); window.nexus.settings.save({ selectedVersion: v }) }
  function pickLoader(l: Loader) { setLoader(l); setInstId(null); window.nexus.settings.save({ selectedLoader: l }) }

  // FPS/ms y Optimizar dentro del juego usan mods => piden un loader. Si estás en Vanilla se cambia a Fabric.
  function needLoader() {
    if (!inst && loader === 'vanilla') {
      if (avail.fabric) { pickLoader('fabric'); return true }
      setError('Esta versión no tiene Fabric. Para FPS/ms y Optimizar dentro de Minecraft elegí otra versión (1.14 o más nueva).')
      return false
    }
    return true
  }
  function toggleOpt(on: boolean) {
    if (on && !needLoader()) return
    setOptimize(on)
    const next = { ...opt, enabled: on }
    setOpt(next)
    window.nexus.settings.save({ optimize: next })
  }
  function toggleHud(on: boolean) {
    if (on && !needLoader()) return
    setHud(on)
    window.nexus.settings.save({ showHud: on })
  }

  const handlePlay = useCallback(async () => {
    if (!selected || !activeProfile) return
    setLaunching(true); setError(''); setNotices([])
    const s = await window.nexus.settings.get()
    const unsub = window.nexus.on('download:progress', (p: any) => {
      setDownloadProgress(p)
      if (p.phase !== 'done') setScreen('download')
    })
    try {
      const result = await window.nexus.launcher.launch({
        versionId: selected,
        loader: effLoader,
        instanceId: instId || undefined,
        profileType: activeProfile.type,
        profileData: { username: activeProfile.username, uuid: activeProfile.uuid, accessToken: activeProfile.accessToken },
        settings: { gameDir: s.gameDir, javaPath: s.javaPath, maxRam: maxRam, minRam: Math.min(minRam, maxRam), jvmArgs: s.jvmArgs },
        optimize: optimize ? { ...opt, enabled: true } : undefined,
        showHud: hud,
      })
      setScreen('main'); setDownloadProgress(null)
      if (!result.success) setError(result.error ?? 'Error al lanzar Minecraft.')
      else if (result.notices?.length) setNotices(result.notices)
    } finally {
      setLaunching(false)
      if (unsub) unsub()
    }
  }, [selected, activeProfile, effLoader, instId, maxRam, minRam, optimize, hud, opt, setScreen, setDownloadProgress])

  const shown = versions.filter(v => okVersion(v) && (v.type === 'release' || (showSnaps && v.type === 'snapshot')))
  const fmt = (m: number) => (m >= 1024 ? `${(m / 1024).toFixed(1)} GB` : `${m} MB`)

  return (
    <div className="main-screen">
      <div className="screen-header">
        <div>
          <h2>Jugar</h2>
          <p className="subtitle">Elegí versión y loader, y a jugar.</p>
        </div>
        {activeProfile && (
          <div className="profile-pill">
            <span className="pill-name">{activeProfile.username}</span>
            <span className={`pill-badge ${activeProfile.type}`}>{activeProfile.type === 'microsoft' ? 'Premium' : 'Offline'}</span>
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {notices.length > 0 && <div className="alert warn"><div>{notices.map((n, i) => <div key={i}>{n}</div>)}</div></div>}

      <div className="hero">
        <div className="hero-top">
          <div className="hero-col">
            <label>Versión de Minecraft</label>
            {loadingV ? <div className="loading-row"><span className="spin">⟳</span> Cargando versiones...</div> : (
              <select className="select" value={inst ? inst.mcVersion : selected} disabled={!!inst} onChange={e => pickVersion(e.target.value)}>
                {shown.map(v => <option key={v.id} value={v.id}>{v.id}{v.type !== 'release' ? ` (${v.type})` : ''}</option>)}
              </select>
            )}
            <label className="checkbox">
              <input type="checkbox" checked={showSnaps} onChange={e => { setShowSnaps(e.target.checked); window.nexus.settings.save({ showSnapshots: e.target.checked }) }} />
              Mostrar snapshots
            </label>
          </div>
          <div className="hero-col" style={{ flex: 2 }}>
            <label>Loader {inst && <span style={{ textTransform: 'none', letterSpacing: 0 }}>· modpack: {inst.name}</span>}</label>
            <div className="chips">
              {LOADERS.map(l => (
                <button key={l.id} className={`chip ${effLoader === l.id ? 'on' : ''}`} disabled={!!inst || (l.id !== 'vanilla' && !avail[l.id])} onClick={() => pickLoader(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="play-btn" onClick={handlePlay} disabled={launching || !selected || loadingV}>
          <IconPlay /> {launching ? 'INICIANDO...' : 'JUGAR'}
        </button>
      </div>

      {insts.some(i => i.modpack) && (
        <div className="card">
          <h3>Mis modpacks</h3>
          <div className="modpack-list">
            {insts.filter(i => i.modpack).map(i => (
              <div key={i.id} className={`modpack-chip ${instId === i.id ? 'on' : ''}`} onClick={() => setInstId(instId === i.id ? null : i.id)}>
                <div>{i.name}<br /><small>{i.mcVersion} · {i.loader}</small></div>
                <button className="x" title="Eliminar modpack y sus mundos" onClick={async e => {
                  e.stopPropagation()
                  if (confirm(`¿Eliminar "${i.name}" con todos sus mods y mundos?`)) { await window.nexus.instances.remove(i.id); if (instId === i.id) setInstId(null); refreshInsts() }
                }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card toggle-card">
          <div className="tc-body">
            <h3>Mostrar FPS y ms en el juego</h3>
            <p>Instala un contador (FPS, ping y RAM) que se ve dentro de Minecraft. Usa Fabric/Forge/NeoForge/Quilt.</p>
          </div>
          <label className="switch"><input type="checkbox" checked={hud} onChange={e => toggleHud(e.target.checked)} /><span /></label>
        </div>
        <div className="card toggle-card">
          <div className="tc-body">
            <h3>Optimizar Minecraft (PC de pocos recursos)</h3>
            <p>Instala Sodium, Lithium y similares, baja gráficos y ajusta la JVM. Se aplica dentro del juego.</p>
          </div>
          <label className="switch"><input type="checkbox" checked={optimize} onChange={e => toggleOpt(e.target.checked)} /><span /></label>
        </div>
      </div>

      <div className="card">
        <h3>Memoria RAM máxima para Minecraft</h3>
        <div className="ram-row">
          <input type="range" className="slider" min={512} max={16384} step={256} value={maxRam}
            onChange={e => { const v = parseInt(e.target.value); setMaxRam(v); window.nexus.settings.save({ maxRam: v }) }} />
          <span className="ram-label">{fmt(maxRam)}</span>
        </div>
        <p className="card-desc" style={{ marginTop: 10, marginBottom: 0 }}>Este límite se aplica al abrir el juego (-Xmx{maxRam}M).</p>
      </div>

      {activeProfile?.type === 'offline' && (
        <div className="alert warn">Modo offline: solo singleplayer, LAN y servidores con <code>online-mode=false</code>.</div>
      )}
    </div>
  )
}
