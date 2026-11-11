import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  selectDir: () => ipcRenderer.invoke('settings:selectDir'),
  selectJava: () => ipcRenderer.invoke('settings:selectJava'),
  getDefaultDir: () => ipcRenderer.invoke('settings:getDefaultDir'),

  getAllProfiles: () => ipcRenderer.invoke('profiles:getAll'),
  getActiveProfile: () => ipcRenderer.invoke('profiles:getActive'),
  setActiveProfile: (id: string) => ipcRenderer.invoke('profiles:setActive', id),
  deleteProfile: (id: string) => ipcRenderer.invoke('profiles:delete', id),

  getVersionManifest: () => ipcRenderer.invoke('versions:getManifest'),
  getVersionInfo: (versionId: string) => ipcRenderer.invoke('versions:getVersionInfo', versionId),

  launchGame: (payload: { versionId: string; username?: string }) =>
    ipcRenderer.invoke('launch:game', payload),

  onLaunchProgress: (callback: (info: {
    stage: string
    current: number
    total: number
    message: string
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: any) => callback(info)
    ipcRenderer.on('launch:progress', listener)
    return () => ipcRenderer.removeListener('launch:progress', listener)
  },
}

contextBridge.exposeInMainWorld('nexus', api)

export type NexusAPI = typeof api
