import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store/useStore'

type Src = 'modrinth' | 'curseforge'
type Kind = 'mod' | 'modpack' | 'resourcepack' | 'shader'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'mod', label: 'Mods' }, { id: 'modpack', label: 'Modpacks' },
  { id: 'resourcepack', label: 'Resource packs' }, { id: 'shader', label: 'Shaders' },
]
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']
const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n))

export function ExploreScreen() {
  const { setScreen } = useStore()
  const [src, setSrc] = useState<Src>('modrinth')
  const [kind, setKind] = useState<Kind>('mod')
  const [q, setQ] = useState('')
  const [mc, setMc] = useState('')
  const [loader, setLoader] = useState('fabric')
  const [versions, setVersions] = useState<string[]>([])
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; skipped: string[] } | null>(null)
  const [installing, setInstalling] = useState('')
  const [prog, setProg] = useState('')
  const [list, setList] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const s = await window.nexus.settings.get()
      if (s.selectedLoader) setLoader(s.selectedLoader)
      const r = await window.nexus.versions.getManifest()
      if (r.success && r.manifest) {
        const rel = r.manifest.versions.filter((v: any) => v.type === 'release').map((v: any) => v.id)
        setVersions(rel)
        setMc(s.selectedVersion && rel.includes(s.selectedVersion) ? s.selectedVersion : r.manifest.latest.release)
      }
    })()
    return window.nexus.on('content:progress', (p: any) => setProg(p.total ? `${p.msg} (${p.current}/${p.total})` : p.msg))
  }, [])

  const search = useCallback(async (pg = 0) => {
    if (!mc) return
    setBusy(true); setError('')
    const r = await window.nexus.content.search({ source: src, type: kind, query: q, mcVersion: kind === 'modpack' ? undefined : mc, loader, page: pg })
    setBusy(false)
    if (!r.success) { setError(r.error || 'Error al buscar.'); setItems([]); return }
    setItems(r.items); setTotal(r.total); setPage(pg)
  }, [src, kind, q, mc, loader])

  useEffect(() => { if (mc) search(0) }, [src, kind, mc, loader]) // eslint-disable-line react-hooks/exhaustive-deps

  async function install(it: any) {
    setInstalling(it.id); setMsg(null); setProg('')
    const r = await window.nexus.content.install({ source: it.source, type: it.type, projectId: it.id, mcVersion: mc, loader })
    setInstalling(''); setProg('')
    const n = r.installed?.length ?? 0
    setMsg({
      ok: r.success,
      text: r.success
        ? (it.type === 'modpack' ? `Modpack instalado. Lo ves en Jugar > Mis modpacks.` : r.message || `Instalado: ${n} archivo(s).`)
        : r.message || 'No se pudo instalar.',
      skipped: r.skipped || [],
    })
    if (r.success) refreshList()
  }

  const refreshList = useCallback(async () => {
    if (!mc) return
    const r = await window.nexus.content.installed(mc, loader)
    setList(r.success ? r : null)
  }, [mc, loader])

  const needKey = src === 'curseforge' && /clave de API/i.test(error)

  return (
    <div className="explore-screen">
      <div className="screen-header">
        <div><h2>Explorar</h2><p className="subtitle">Mods, modpacks, resource packs y shaders de Modrinth y CurseForge.</p></div>
      </div>

      <div className="tabs">
        <button className={`tab ${src === 'modrinth' ? 'on' : ''}`} onClick={() => setSrc('modrinth')}>Modrinth</button>
        <button className={`tab ${src === 'curseforge' ? 'on' : ''}`} onClick={() => setSrc('curseforge')}>CurseForge</button>
      </div>
      <div className="tabs">
        {KINDS.map(k => <button key={k.id} className={`tab ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>

      <div className="explore-bar">
        <input className="text-input" placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(0)} />
        {kind !== 'modpack' && (
          <select className="select" value={mc} onChange={e => setMc(e.target.value)}>
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        {(kind === 'mod' || kind === 'shader') && (
          <select className="select" value={loader} onChange={e => { setLoader(e.target.value); window.nexus.settings.save({ selectedLoader: e.target.value }) }}>
            {LOADERS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <button className="btn-sec" onClick={() => search(0)}>Buscar</button>
        <button className="btn-sec" onClick={refreshList}>Ver instalado</button>
      </div>

      {error && (
        <div className="alert error">
          <div>{error} {needKey && <button className="btn-sec" style={{ marginLeft: 8 }} onClick={() => setScreen('settings')}>Ir a Configuración</button>}</div>
        </div>
      )}
      {prog && <div className="alert info">{prog}</div>}
      {msg && (
        <div className={`alert ${msg.ok ? 'ok' : 'error'}`}>
          <div>{msg.text}
            {msg.skipped.length > 0 && <ul>{msg.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          </div>
        </div>
      )}

      {list && (
        <div className="card">
          <h3>Instalado para {mc} · {loader}</h3>
          {(['mods', 'resourcepacks', 'shaders'] as const).map(k => list[k]?.length > 0 && (
            <div key={k} style={{ marginBottom: 12 }}>
              <label>{k}</label>
              <div className="installed-list">
                {list[k].map((f: any) => (
                  <div className="installed-row" key={f.name}>
                    <span>{f.name}</span>
                    <button className="btn-sec danger" onClick={async () => { await window.nexus.content.remove({ mcVersion: mc, loader, kind: k, name: f.name }); refreshList() }}>Quitar</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!list.mods?.length && !list.resourcepacks?.length && !list.shaders?.length && <p className="card-desc">Nada instalado todavía.</p>}
        </div>
      )}

      {busy ? <div className="loading-row big"><span className="spin">⟳</span> Buscando...</div> : items.length === 0 && !error ? <div className="empty">Sin resultados.</div> : (
        <div className="results">
          {items.map(it => (
            <div className="item" key={it.source + it.id}>
              <div className="item-head">
                {it.icon ? <img className="item-icon" src={it.icon} alt="" /> : <div className="item-icon" />}
                <div style={{ minWidth: 0 }}>
                  <div className="item-title">{it.title}</div>
                  <div className="item-meta">{it.author} · {fmtN(it.downloads)} descargas</div>
                </div>
              </div>
              <div className="item-desc">{it.description}</div>
              <div className="item-actions">
                <button className="btn-install" disabled={!!installing} onClick={() => install(it)}>{installing === it.id ? 'Instalando...' : 'Instalar'}</button>
                <button className="btn-sec" onClick={() => window.nexus.app.openExternal(it.url)}>Abrir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="pager">
          <button className="btn-sec" disabled={page === 0 || busy} onClick={() => search(page - 1)}>Anterior</button>
          <span>Página {page + 1} de {Math.ceil(total / 20)}</span>
          <button className="btn-sec" disabled={(page + 1) * 20 >= total || busy} onClick={() => search(page + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  )
}
