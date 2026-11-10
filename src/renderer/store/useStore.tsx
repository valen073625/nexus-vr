import React, { createContext, useContext, useState, ReactNode } from 'react'

interface StoreState {
  theme: 'dark' | 'darker'
  setTheme: (theme: 'dark' | 'darker') => void
}

const StoreContext = createContext<StoreState | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'darker'>('dark')

  return (
    <StoreContext.Provider value={{ theme, setTheme }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) {
    throw new Error('useStore must be used within StoreProvider')
  }
  return ctx
}
