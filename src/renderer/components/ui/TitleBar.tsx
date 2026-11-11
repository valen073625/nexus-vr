import React, { useState, useEffect } from 'react'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.nexus.window.isMaximized().then(setMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-title">⬡ Nexus Launcher</span>
      </div>
      <div className="titlebar-controls">
        <button className="tbtn" onClick={() => window.nexus.window.minimize()} title="Minimizar">─</button>
        <button className="tbtn" onClick={async () => {
          await window.nexus.window.maximize()
          setMaximized(await window.nexus.window.isMaximized())
        }} title={maximized ? 'Restaurar' : 'Maximizar'}>{maximized ? '❐' : '□'}</button>
        <button className="tbtn tbtn-close" onClick={() => window.nexus.window.close()} title="Cerrar">✕</button>
      </div>
    </div>
  )
}
