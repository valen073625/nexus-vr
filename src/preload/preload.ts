import { contextBridge, ipcRenderer } from 'electron'

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  auth: {
    microsoft: {
      login: () => ipcRenderer.invoke('auth:microsoft:login'),
      logout: () => ipcRenderer.invoke('auth:microsoft:logout'),
      refresh: () => ipcRenderer.invoke('auth:microsoft:refresh'),
      getCurrent: () => ipcRenderer.invoke('auth:microsoft:getCurrent'),
    },
    offline: {
      create: (username: string) => ipcRenderer.invoke('auth:offline:create', username),
      getAll: () => ipcRenderer.invoke('auth:offline:getAll'),
      delete: (id: string) => ipcRenderer.invoke('auth:offline:delete', id),
    },
  },
  profiles: {
    getAll: () => ipcRenderer.invoke('profiles:getAll'),
    getActive: () => ipcRenderer.invoke('profiles:getActive'),
    setActive: (id: string) => ipcRenderer.invoke('profiles:setActive', id),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
  },
  versions: {
    getManifest: () => ipcRenderer.invoke('versions:getManifest'),
    getVersionInfo: (id: string) => ipcRenderer.invoke('versions:getVersionInfo', id),
  },
  launcher: {
    launch: (opts: any) => ipcRenderer.invoke('launcher:launch', opts),
  },
  java: {
    detect: (versionId: string) => ipcRenderer.invoke('java:detect', versionId),
    download: (majorVersion: number) => ipcRenderer.invoke('java:download', majorVersion),
  },
  skins: {
    list: () => ipcRenderer.invoke('skins:list'),
    getActive: () => ipcRenderer.invoke('skins:getActive'),
    setActive: (id: string | null) => ipcRenderer.invoke('skins:setActive', id),
    import: () => ipcRenderer.invoke('skins:import'),
    delete: (id: string) => ipcRenderer.invoke('skins:delete', id),
    getDataUrl: (id: string) => ipcRenderer.invoke('skins:getDataUrl', id),
    getActiveDataUrl: () => ipcRenderer.invoke('skins:getActiveDataUrl'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (s: any) => ipcRenderer.invoke('settings:save', s),
    selectDir: () => ipcRenderer.invoke('settings:selectDir'),
    selectJava: () => ipcRenderer.invoke('settings:selectJava'),
    getDefaultDir: () => ipcRenderer.invoke('settings:getDefaultDir'),
  },
  on: (channel: string, cb: (...args: any[]) => void) => {
    const allowed = ['download:progress', 'launch:log', 'launch:exit']
    if (!allowed.includes(channel)) return
    const wrapper = (_: Electron.IpcRendererEvent, ...args: any[]) => cb(...args)
    ipcRenderer.on(channel, wrapper)
    return () => ipcRenderer.removeListener(channel, wrapper)
  },
  off: (channel: string, cb: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, cb)
  },
}

contextBridge.exposeInMainWorld('nexus', api)
