import React, { useEffect, useState } from 'react'

interface SkinInfo { id: string; name: string }

export function SkinsScreen() {
  const [skins, setSkins] = useState<SkinInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  async function reload() {
    const data = await window.nexus.skins.list()
    setSkins(data.skins || [])
    setActiveId(data.activeId)
    const next: Record<string, string> = {}
    for (const skin of data.skins || []) {
      const url = await window.nexus.skins.getDataUrl(skin.id)
      if (url) next[skin.id] = url
    }
    setUrls(next)
  }

  useEffect(() => { reload().catch((e) => setError(String(e.message || e))) }, [])

  async function importSkin() {
    setError('')
    const r = await window.nexus.skins.import()
    if (!r.success && !r.canceled) setError(r.error || 'No se pudo importar la skin')
    if (r.success) await reload()
  }

  return (
    <div className="settings-screen">
      <div className="screen-header">
        <h2>Skins</h2>
        <button className="btn-save" onClick={importSkin}>Importar PNG</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <p className="card-desc">PNG de 64x64 o 64x32. La skin activa se aplica al jugar en offline.</p>
      <div className="card">
        {skins.length === 0 && <p>No hay skins importadas.</p>}
        {skins.map((skin) => (
          <div key={skin.id} className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
            {urls[skin.id] && (
              <img src={urls[skin.id]} alt="" width={48} height={48} style={{ imageRendering: 'pixelated', background: '#222' }} />
            )}
            <span className="flex1">{skin.name}{skin.id === activeId ? ' (activa)' : ''}</span>
            <button className="btn-sec" onClick={async () => { await window.nexus.skins.setActive(skin.id); await reload() }}>Usar</button>
            <button className="btn-sec" onClick={async () => { await window.nexus.skins.delete(skin.id); await reload() }}>Borrar</button>
          </div>
        ))}
        {activeId && (
          <button className="btn-sec" onClick={async () => { await window.nexus.skins.setActive(null); await reload() }}>Quitar skin activa</button>
        )}
      </div>
    </div>
  )
}
