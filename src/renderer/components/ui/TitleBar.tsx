import React, { useState, useEffect } from 'react'
import { IconMin, IconMax, IconRestore, IconClose } from './Icons'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => { window.nexus.window.isMaximized().then(setMaximized) }, [])
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <img className="titlebar-logo" src="./logo.png" alt="" />
        <span className="titlebar-title">NEXUS LAUNCHER</span>
      </div>
      <div className="titlebar-controls">
        <button className="tbtn" aria-label="Minimizar" onClick={() => window.nexus.window.minimize()}><IconMin /></button>
        <button className="tbtn" aria-label="Maximizar" onClick={async () => {
          await window.nexus.window.maximize()
          setMaximized(await window.nexus.window.isMaximized())
        }}>{maximized ? <IconRestore /> : <IconMax />}</button>
        <button className="tbtn tbtn-close" aria-label="Cerrar" onClick={() => window.nexus.window.close()}><IconClose /></button>
      </div>
    </div>
  )
}
