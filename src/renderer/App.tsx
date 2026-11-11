import React, { useEffect, useState } from 'react'
import { LoginScreen }    from './components/screens/LoginScreen'
import { MainScreen }     from './components/screens/MainScreen'
import { DownloadScreen } from './components/screens/DownloadScreen'
import { SettingsScreen } from './components/screens/SettingsScreen'
import { TitleBar }       from './components/ui/TitleBar'
import { Sidebar }        from './components/ui/Sidebar'
import { useStore }       from './store/useStore'

export default function App() {
  const { activeProfile, setActiveProfile, screen, setScreen } = useStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function restore() {
      try {
        const ms = await window.nexus.auth.microsoft.getCurrent()
        if (ms.success && ms.profile) {
          setActiveProfile(ms.profile)
          setScreen('main')
          setLoading(false)
          return
        }
        const off = await window.nexus.auth.offline.getAll()
        if (off.success && off.profiles?.length) {
          setActiveProfile(off.profiles[0])
          setScreen('main')
          setLoading(false)
          return
        }
      } catch { /* sin sesión */ }
      setScreen('login')
      setLoading(false)
    }
    restore()
  }, [])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <span>Cargando Nexus Launcher...</span>
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar />
      {screen === 'login' ? (
        <LoginScreen />
      ) : (
        <div className="app-body">
          <Sidebar />
          <main className="app-content">
            {screen === 'main'     && <MainScreen />}
            {screen === 'download' && <DownloadScreen />}
            {screen === 'settings' && <SettingsScreen />}
          </main>
        </div>
      )}
    </div>
  )
}
