import React, { useState, useEffect } from 'react'

export function SettingsScreen() {
  const [gameDir, setGameDir]   = useState('')
  const [javaPath, setJavaPath] = useState('')
  const [maxRam, setMaxRam]     = useState(2048)
  const [minRam, setMinRam]     = useState(512)
  const [jvmArgs, setJvmArgs]   = useState('')
  const [saved, setSaved]       = useState(false)
  const [javaStatus, setJavaStatus] = useState<'idle'|'checking'|'found'|'missing'>('idle')

  useEffect(() => {
    window.nexus.settings.get().then(s => {
      setGameDir(s.gameDir ?? '')
      setJavaPath(s.javaPath ?? '')
      setMaxRam(s.maxRam ?? 2048)
      setMinRam(s.minRam ?? 512)
      setJvmArgs(s.jvmArgs ?? '')
    })
  }, [])

  async function save() {
    await window.nexus.settings.save({ gameDir, javaPath, maxRam, minRam, jvmArgs })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function detectJava() {
    setJavaStatus('checking')
    const r = await window.nexus.java.detect('')
    if (r.success && r.javaPath) { setJavaPath(r.javaPath); setJavaStatus('found') }
    else setJavaStatus('missing')
  }

  return (
    <div className="settings-screen">
      <div className="screen-header">
        <h2>⚙️ Configuración</h2>
        <button className={`btn-save ${saved ? 'saved' : ''}`} onClick={save}>
          {saved ? '✓ Guardado' : '💾 Guardar'}
        </button>
      </div>

      <div className="card">
        <h3>📂 Directorio de instalación</h3>
        <p className="card-desc">Carpeta donde se instalan versiones, assets y mundos.</p>
        <div className="row">
          <input className="text-input flex1" value={gameDir} onChange={e => setGameDir(e.target.value)} placeholder="Ruta de instalación..." />
          <button className="btn-sec" onClick={async () => {
            const r = await window.nexus.settings.selectDir()
            if (!r.canceled && r.path) setGameDir(r.path)
          }}>Explorar</button>
        </div>
      </div>

      <div className="card">
        <h3>☕ Java Runtime</h3>
        <p className="card-desc">Deja en blanco para detectar automáticamente. Si Java no está instalado, el launcher lo descargará.</p>
        <div className="row">
          <input className="text-input flex1" value={javaPath} onChange={e => setJavaPath(e.target.value)} placeholder="Ruta al ejecutable de Java (opcional)" />
          <button className="btn-sec" onClick={async () => {
            const r = await window.nexus.settings.selectJava()
            if (!r.canceled && r.path) setJavaPath(r.path)
          }}>Explorar</button>
          <button className="btn-sec" onClick={detectJava}>
            {javaStatus === 'checking' ? '...' : 'Detectar'}
          </button>
        </div>
        {javaStatus === 'found'   && <p className="status-ok">✓ Java detectado correctamente</p>}
        {javaStatus === 'missing' && <p className="status-warn">⚠ Java no encontrado. Se descargará automáticamente.</p>}
      </div>

      <div className="card">
        <h3>💾 Memoria RAM</h3>
        <div className="ram-fields">
          <div className="ram-field">
            <label>Máxima</label>
            <div className="ram-row">
              <input type="range" min={512} max={16384} step={512} value={maxRam} className="slider"
                onChange={e => setMaxRam(parseInt(e.target.value))} />
              <span className="ram-label">{maxRam >= 1024 ? `${(maxRam/1024).toFixed(1)} GB` : `${maxRam} MB`}</span>
            </div>
          </div>
          <div className="ram-field">
            <label>Mínima</label>
            <div className="ram-row">
              <input type="range" min={256} max={4096} step={256} value={minRam} className="slider"
                onChange={e => setMinRam(parseInt(e.target.value))} />
              <span className="ram-label">{minRam >= 1024 ? `${(minRam/1024).toFixed(1)} GB` : `${minRam} MB`}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>🔧 Argumentos JVM adicionales</h3>
        <p className="card-desc">Separados por espacios. Avanzado.</p>
        <textarea className="textarea" value={jvmArgs} onChange={e => setJvmArgs(e.target.value)}
          placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled" rows={3} />
      </div>
    </div>
  )
}
