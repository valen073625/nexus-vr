import React, { useState } from 'react'
import { useStore } from '../../store/useStore'

type Mode = 'select' | 'offline'

export function LoginScreen() {
  const { setActiveProfile, setScreen } = useStore()
  const [mode, setMode] = useState<Mode>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [nameErr, setNameErr] = useState('')

  async function loginMicrosoft() {
    setLoading(true); setError('')
    try {
      const r = await window.nexus.auth.microsoft.login()
      if (r.success && r.profile) {
        setActiveProfile(r.profile)
        setScreen('main')
      } else {
        setError(r.error ?? 'Error al iniciar sesión con Microsoft.')
      }
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  function validateName(n: string): string {
    if (n.length < 2) return 'Mínimo 2 caracteres.'
    if (n.length > 16) return 'Máximo 16 caracteres.'
    if (!/^[a-zA-Z0-9_-]+$/.test(n)) return 'Solo letras, números, _ y -.'
    return ''
  }

  async function createOffline() {
    const err = validateName(name)
    if (err) { setNameErr(err); return }
    setLoading(true); setNameErr('')
    try {
      const r = await window.nexus.auth.offline.create(name)
      if (r.success && r.profile) {
        setActiveProfile(r.profile)
        setScreen('main')
      } else {
        setNameErr(r.error ?? 'Error al crear perfil.')
      }
    } catch (e: any) {
      setNameErr(e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">⬡</div>
          <h1>Nexus Launcher</h1>
          <p>Launcher para Minecraft: Java Edition</p>
        </div>

        {mode === 'select' ? (
          <div className="login-options">
            {error && <div className="alert error">{error}</div>}

            <button className="btn-ms" onClick={loginMicrosoft} disabled={loading}>
              {loading ? '...' : '🪟 Iniciar sesión con Microsoft'}
            </button>

            <div className="divider"><span>o</span></div>

            <button className="btn-offline" onClick={() => setMode('offline')} disabled={loading}>
              👤 Perfil Offline
            </button>

            <p className="info-text">
              ℹ️ El modo offline solo funciona en singleplayer, LAN y servidores con
              <code> online-mode=false</code>.
            </p>
          </div>
        ) : (
          <div className="offline-form">
            <button className="back-link" onClick={() => { setMode('select'); setNameErr('') }}>
              ← Volver
            </button>
            <h2>Crear perfil offline</h2>

            <div className="warn-box">
              ⚠️ <strong>El modo offline no permite entrar a servidores que requieren
              una cuenta premium o autenticación oficial.</strong>
            </div>

            <div className="field">
              <label>Nombre de usuario</label>
              <input
                className={nameErr ? 'err' : ''}
                type="text"
                placeholder="2-16 caracteres"
                maxLength={16}
                value={name}
                onChange={e => { setName(e.target.value); if (nameErr) setNameErr('') }}
                onKeyDown={e => { if (e.key === 'Enter') createOffline() }}
                autoFocus
              />
              {nameErr && <span className="field-err">{nameErr}</span>}
              <span className="field-hint">Solo letras (a-z A-Z), números, _ y -</span>
            </div>

            <button className="btn-primary" onClick={createOffline} disabled={loading || !name}>
              {loading ? '...' : 'Crear perfil'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
