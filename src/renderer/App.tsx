import React from 'react'

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>Nexus Launcher</h1>
        <p className="subtitle">Minecraft: Java Edition</p>
      </header>

      <main className="main">
        <section className="card">
          <h2>Estado</h2>
          <p>La aplicación arrancó correctamente.</p>
          <p className="hint">
            Los módulos críticos (main, preload, servicios y React) ya están en su lugar.
          </p>
        </section>

        <section className="card">
          <h2>Próximos pasos</h2>
          <ul>
            <li>UI de perfiles y versiones</li>
            <li>Login con Microsoft</li>
            <li>Descarga e instalación de versiones</li>
            <li>Lanzamiento del juego</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
