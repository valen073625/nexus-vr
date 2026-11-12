import React, { useEffect, useState } from 'react'
import SkinPreview from '../SkinPreview'
import { useStore } from '../../store/useStore'

interface SkinInfo { id: string; name: string }

export function SkinsScreen() {
  const { activeProfile } = useStore()
  const [skins, setSkins] = useState<SkinInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [shownId, setShownId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function reload(select?: string | null) {
    const data = await window.nexus.skins.list()
    const list: SkinInfo[] = data.skins || []
    setSkins(list)
    setActiveId(data.activeId)
    const next: Record<string, string> = {}
    for (const s of list) {
      const u = await window.nexus.skins.getDataUrl(s.id)
      if (u) next[s.id] = u
    }
    setUrls(next)
    setShownId(cur => select ?? (cur && list.some(s => s.id === cur) ? cur : data.activeId ?? list[0]?.id ?? null))
  }

  useEffect(() => { reload().catch(e => setError(String(e.message || e))) }, [])

  async function importSkin() {
    setError('')
    const before = new Set(skins.map(s => s.id))
    const r = await window.nexus.skins.import()
    if (!r.success && !r.canceled) { setError(r.error || 'No se pudo importar la skin'); return }
    if (r.success) {
      const data = await window.nexus.skins.list()
      const added = (data.skins || []).find((s: SkinInfo) => !before.has(s.id))
      await reload(added?.id ?? null)
    }
  }

  const shown = shownId ? skins.find(s => s.id === shownId) : null

  return (
    <div className="skins-screen">
      <div className="screen-header">
        <div><h2>Skins</h2><p className="subtitle">Elegí tu skin y mirala antes de jugar.</p></div>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="skins-layout">
        <div className="card skin-stage">
          <h3>Skin del jugador</h3>
          <SkinPreview dataUrl={shownId ? urls[shownId] ?? null : null} username={activeProfile?.username} size={320} />
          <div className="skin-username">{activeProfile?.username}</div>
          {shown && <div className="item-meta">{shown.name}{shown.id === activeId ? ' · activa' : ''}</div>}
          <div className="row">
            {shown && shown.id !== activeId && (
              <button className="btn-install" onClick={async () => { await window.nexus.skins.setActive(shown.id); await reload(shown.id) }}>Usar esta skin</button>
            )}
            {activeId && (
              <button className="btn-sec" onClick={async () => { await window.nexus.skins.setActive(null); await reload() }}>Quitar skin activa</button>
            )}
          </div>
        </div>

        <div className="skin-side">
          <button className="dropzone" onClick={importSkin}>
            <span className="dz-plus">+</span>
            <strong>Agregar imagen de la skin</strong>
            <small>PNG de 64×64 o 64×32</small>
          </button>

          <div className="card">
            <h3>Mis skins</h3>
            {skins.length === 0 && <p className="card-desc">Todavía no agregaste ninguna.</p>}
            <div className="skin-grid">
              {skins.map(s => (
                <div key={s.id} className={`skin-tile ${s.id === shownId ? 'on' : ''}`} onClick={() => setShownId(s.id)}>
                  {urls[s.id] && <img src={urls[s.id]} alt="" />}
                  <span>{s.name}{s.id === activeId ? ' ✓' : ''}</span>
                  <button className="x" title="Borrar" onClick={async e => { e.stopPropagation(); await window.nexus.skins.delete(s.id); await reload() }}>×</button>
                </div>
              ))}
            </div>
          </div>
          <p className="card-desc">La skin activa se aplica al jugar en modo offline.</p>
        </div>
      </div>
    </div>
  )
}
