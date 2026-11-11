import React, { useState, useCallback, createContext, useContext } from 'react'

export interface Profile {
  type: 'microsoft' | 'offline'
  id: string
  username: string
  uuid: string
  accessToken?: string
  expiresAt?: number
}

export interface DownloadProgress {
  phase: 'client' | 'libraries' | 'assets' | 'java' | 'done'
  current: number
  total: number
  currentFile: string
  speed: number
  downloaded: number
  totalBytes: number
}

export interface AppSettings {
  gameDir: string
  javaPath: string
  maxRam: number
  minRam: number
  jvmArgs: string
  selectedVersion: string
  showSnapshots: boolean
  theme: string
  closeOnLaunch: boolean
}

export type Screen = 'login' | 'main' | 'download' | 'settings'

interface StoreState {
  activeProfile: Profile | null
  setActiveProfile: (p: Profile | null) => void
  screen: Screen
  setScreen: (s: Screen) => void
  downloadProgress: DownloadProgress | null
  setDownloadProgress: (p: DownloadProgress | null) => void
  settings: AppSettings | null
  setSettings: (s: AppSettings) => void
}

const Ctx = createContext<StoreState | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [screen, setScreen] = useState<Screen>('login')
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  return React.createElement(Ctx.Provider, {
    value: {
      activeProfile,
      setActiveProfile: useCallback((p) => setActiveProfile(p), []),
      screen,
      setScreen: useCallback((s) => setScreen(s), []),
      downloadProgress,
      setDownloadProgress: useCallback((p) => setDownloadProgress(p), []),
      settings,
      setSettings: useCallback((s) => setSettings(s), []),
    },
    children,
  })
}

export function useStore(): StoreState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
