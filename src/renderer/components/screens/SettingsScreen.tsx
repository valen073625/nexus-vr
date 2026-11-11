import React, { useState, useEffect } from 'react'

export function SettingsScreen() {
  const [gameDir, setGameDir] = useState('')
  const [javaPath, setJavaPath] = useState('')
  const [maxRam, setMaxRam] = useState(2048)
  const [minRam, setMinRam] = useState(512)
  const [jvmArgs, setJvmArgs] = useState('')
  const [saved, setSaved] = useState(false)
  const [javaStatus, setJavaStatus] = useState<'idle' | 'checking' | 'found' | 'missing'>('idle')

  useEffect(() => {
    window.nexus.settings.get().then(s => {
      setGameDir(s.gameDir ?? '')
      setJavaPath(s.javaPath ?? '')
      setMaxRam(Number(s.maxRam) || 2048)
      setMinRam(Number(s.minRam) || 512)
      setJvmArgs(s.jvmArgs ?? '')
    })
  }, [])

  async function save() {
    const max = Math.max(512, maxRam)
    const min = Math.min(minRam, max)
    setMaxRam(max)
    setMinRam(min)
    await window.nexus.settings.save({ gameDir, javaPath, maxRam: max, minRam: min, jvmArgs })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function detectJava() {
    setJavaStatus('checking')
    const r = await window.nexus.java.detect('1.20.1')
    if (r.success && r.javaPath) { setJavaPath(r.javaPath); setJavaStatus('found') }
    else setJavaStatus('missing')
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
        <h3>Memoria RAM</h3>
        <label>Maxima: {maxRam >= 1024 ? `${(maxRam / 1024).toFixed(1)} GB` : `${maxRam} MB`}</label>
        <input type="range" min={512} max={16384} step={512} value={maxRam} className="slider" onChange={e => setMaxRam(parseInt(e.target.value, 10))} />
        <label>Minima: {minRam} MB</label>
        <input type="range" min={256} max={8192} step={256} value={minRam} className="slider" onChange={e => setMinRam(parseInt(e.target.value, 10))} />
      </div>
      <div className="card">
        <h3>Argumentos JVM</h3>
        <textarea className="textarea" value={jvmArgs} onChange={e => setJvmArgs(e.target.value)} rows={3} />
      </div>
    </div>
  )
}
