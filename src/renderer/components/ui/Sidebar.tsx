import React from 'react'
import { useStore, type Screen } from '../../store/useStore'
import { IconHome, IconExplore, IconSkin, IconGear, IconLogout } from './Icons'

const NAV: { id: Screen; label: string; icon: React.ReactNode }[] = [
  { id: 'main', label: 'Jugar', icon: <IconHome /> },
  { id: 'explore', label: 'Explorar', icon: <IconExplore /> },
  { id: 'skins', label: 'Skins', icon: <IconSkin /> },
  { id: 'settings', label: 'Configuración', icon: <IconGear /> },
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
      <div className="sidebar-logo">
        <img src="./logo.png" alt="" />
        <div>Nexus<small>Launcher</small></div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${screen === item.id ? 'active' : ''}`}
            onClick={() => setScreen(item.id)}
          >
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        {activeProfile && (
          <div className="profile-card">
            <div className="profile-avatar">{activeProfile.username.charAt(0).toUpperCase()}</div>
            <div className="profile-info">
              <span className="profile-name">{activeProfile.username}</span>
              <span className={`profile-type ${activeProfile.type}`}>
                {activeProfile.type === 'microsoft' ? 'Premium' : 'Offline'}
              </span>
            </div>
          </div>
        )}
        <button className="logout-btn" onClick={handleLogout}><IconLogout />Cerrar sesión</button>
      </div>
    </aside>
  )
}
