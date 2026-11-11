import React from 'react'
import { useStore, type Screen } from '../../store/useStore'

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'main',     label: 'Inicio',       icon: '🏠' },
  { id: 'settings', label: 'Configuración', icon: '⚙️' },
]

export function Sidebar() {
  const { screen, setScreen, activeProfile, setActiveProfile } = useStore()

  async function handleLogout() {
    if (activeProfile?.type === 'microsoft') {
      await window.nexus.auth.microsoft.logout()
    }
    setActiveProfile(null)
    setScreen('login')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">⬡ <strong>Nexus</strong></div>

      <nav className="sidebar-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${screen === item.id ? 'active' : ''}`}
            onClick={() => setScreen(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        {activeProfile && (
          <div className="profile-card">
            <div className="profile-avatar">
              {activeProfile.username.charAt(0).toUpperCase()}
            </div>
            <div className="profile-info">
              <span className="profile-name">{activeProfile.username}</span>
              <span className={`profile-type ${activeProfile.type}`}>
                {activeProfile.type === 'microsoft' ? '⭐ Premium' : '🔒 Offline'}
              </span>
            </div>
          </div>
        )}
        <button className="logout-btn" onClick={handleLogout}>
          ↩ Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
