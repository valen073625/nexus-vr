import { contextBridge, ipcRenderer } from 'electron'

/**
 * API segura expuesta al renderer.
 * Solo se comunican canales whitelisted.
 */
const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  selectDir: () => ipcRenderer.invoke('settings:selectDir'),
  selectJava: () => ipcRenderer.invoke('settings:selectJava'),
  getDefaultDir: () => ipcRenderer.invoke('settings:getDefaultDir'),

  // Profiles
  getAllProfiles: () => ipcRenderer.invoke('profiles:getAll'),
  getActiveProfile: () => ipcRenderer.invoke('profiles:getActive'),
  setActiveProfile: (id: string) => ipcRenderer.invoke('profiles:setActive', id),
  deleteProfile: (id: string) => ipcRenderer.invoke('profiles:delete', id),

  // Versions
  getVersionManifest: () => ipcRenderer.invoke('versions:getManifest'),
  getVersionInfo: (versionId: string) => ipcRenderer.invoke('versions:getVersionInfo', versionId),
}

contextBridge.exposeInMainWorld('nexus', api)

export type NexusAPI = typeof api
