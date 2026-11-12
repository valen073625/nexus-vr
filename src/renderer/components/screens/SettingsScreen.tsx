import React, { useState, useEffect } from 'react'

export function SettingsScreen() {
  const [gameDir, setGameDir] = useState('')
  const [javaPath, setJavaPath] = useState('')
  const [maxRam, setMaxRam] = useState(2048)
  const [minRam, setMinRam] = useState(512)
  const [jvmArgs, setJvmArgs] = useState('')
  const [cfKey, setCfKey] = useState('')
  const [keepOpen, setKeepOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [javaStatus, setJavaStatus] = useState<'idle' | 'checking' | 'found' | 'missing'>('idle')
  const [javaWipe, setJavaWipe] = useState('')

  useEffect(() => {
    window.nexus.settings.get().then(s => {
      setGameDir(s.gameDir ?? '')
      setJavaPath(s.javaPath ?? '')
      setMaxRam(Number(s.maxRam) || 2048)
      setMinRam(Number(s.minRam) || 512)
      setJvmArgs(s.jvmArgs ?? '')
      setCfKey(s.curseforgeApiKey ?? '')
      setKeepOpen(!!s.keepLauncherOpen)
    })
  }, [])

  async function save() {
    const max = Math.max(512, maxRam)
    const min = Math.min(minRam, max)
    setMaxRam(max)
    setMinRam(min)
    await window.nexus.settings.save({ gameDir, javaPath, maxRam: max, minRam: min, jvmArgs, curseforgeApiKey: cfKey.trim(), keepLauncherOpen: keepOpen })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function detectJava() {
    setJavaStatus('checking')
    const r = await window.nexus.java.detect('1.20.1')
    if (r.success && r.javaPath) { setJavaPath(r.javaPath); setJavaStatus('found') }
    else setJavaStatus('missing')
  }

  async function wipeJava() {
    if (!window.confirm('Esto borra solo los Java que descargo Nexus. El Java instalado en Windows no se toca.')) return
    setJavaWipe('')
    const r = await window.nexus.java.deleteDownloaded()
    setJavaWipe(r.success ? 'Javas descargados eliminados. Se volveran a bajar al jugar si faltan.' : (r.error || 'No se pudo borrar'))
  }

  return (
    <div className="settings-screen">
      <div className="screen-header">
        <h2>Configuracion</h2>
        <button className={`btn-save ${saved ? 'saved' : ''}`} onClick={save}>{saved ? 'Guardado' : 'Guardar'}</button>
      </div>
      <div className="card">
        <h3>Directorio del juego</h3>
        <div className="row">
          <input className="text-input flex1" value={gameDir} onChange={e => setGameDir(e.target.value)} />
          <button className="btn-sec" onClick={async () => {
            const r = await window.nexus.settings.selectDir()
            if (!r.canceled && r.path) setGameDir(r.path)
          }}>Explorar</button>
        </div>
      </div>
      <div className="card">
        <h3>Java</h3>
        <p className="card-desc">Vacio = el launcher elige o descarga el Java de esa version.</p>
        <div className="row">
          <input className="text-input flex1" value={javaPath} onChange={e => setJavaPath(e.target.value)} />
          <button className="btn-sec" onClick={async () => {
            const r = await window.nexus.settings.selectJava()
            if (!r.canceled && r.path) setJavaPath(r.path)
          }}>Explorar</button>
          <button className="btn-sec" onClick={detectJava}>{javaStatus === 'checking' ? '...' : 'Detectar'}</button>
        </div>
        {javaStatus === 'found' && <p className="status-ok">Java detectado</p>}
        {javaStatus === 'missing' && <p className="status-warn">No hay Java de esa version. Se descarga al jugar.</p>}
      </div>
      <div className="card">
        <h3>Javas descargados</h3>
        <p className="card-desc">Aparte de la configuracion. Borra la carpeta de runtimes que bajo el launcher (8, 16, 17, 21, 25). No desinstala Java del sistema.</p>
        <button className="btn-sec" onClick={wipeJava}>Eliminar Javas descargados</button>
        {javaWipe && <p className="card-desc">{javaWipe}</p>}
      </div>
      <div className="card">
        <h3>Memoria RAM</h3>
        <label>Maxima: {maxRam >= 1024 ? `${(maxRam / 1024).toFixed(1)} GB` : `${maxRam} MB`}</label>
        <input type="range" min={512} max={16384} step={512} value={maxRam} className="slider" onChange={e => setMaxRam(parseInt(e.target.value, 10))} />
        <label>Minima: {minRam} MB</label>
        <input type="range" min={256} max={8192} step={256} value={minRam} className="slider" onChange={e => setMinRam(parseInt(e.target.value, 10))} />
      </div>
      <div className="card">
        <h3>Launcher</h3>
        <label className="checkbox"><input type="checkbox" checked={keepOpen} onChange={e => setKeepOpen(e.target.checked)} />Mantener el launcher abierto al iniciar Minecraft</label>
      </div>

      <div className="card">
        <h3>CurseForge</h3>
        <p className="card-desc">Para buscar en CurseForge necesitás una clave de API gratuita de console.curseforge.com. Modrinth funciona sin clave.</p>
        <input className="text-input" type="password" placeholder="Clave de API de CurseForge" value={cfKey} onChange={e => setCfKey(e.target.value)} />
      </div>

      <div className="card">
        <h3>Argumentos JVM</h3>
        <textarea className="textarea" value={jvmArgs} onChange={e => setJvmArgs(e.target.value)} rows={3} />
      </div>
    </div>
  )
}
