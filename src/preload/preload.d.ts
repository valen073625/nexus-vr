declare global {
  interface Window {
    nexus: {
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
      }
      auth: {
        microsoft: {
          login: () => Promise<{ success: boolean; profile?: any; error?: string }>
          logout: () => Promise<{ success: boolean; error?: string }>
          refresh: () => Promise<{ success: boolean; profile?: any; error?: string }>
          getCurrent: () => Promise<{ success: boolean; profile?: any; error?: string }>
        }
        offline: {
          create: (username: string) => Promise<{ success: boolean; profile?: any; error?: string }>
          getAll: () => Promise<{ success: boolean; profiles?: any[]; error?: string }>
          delete: (id: string) => Promise<{ success: boolean; error?: string }>
        }
      }
      profiles: {
        getAll: () => Promise<any[]>
        getActive: () => Promise<any | null>
        setActive: (id: string) => Promise<{ success: boolean; error?: string }>
        delete: (id: string) => Promise<{ success: boolean; error?: string }>
      }
      versions: {
        getManifest: () => Promise<{ success: boolean; manifest?: any; error?: string }>
        getVersionInfo: (id: string) => Promise<{ success: boolean; info?: any; error?: string }>
        installed: () => Promise<{ vanilla: string[]; loaders: { id: string; mc: string; loader: string }[] }>
      }
      launcher: {
        launch: (opts: any) => Promise<{ success: boolean; error?: string; notices?: string[] }>
      }
      loaders: {
        availability: (mc: string) => Promise<{ success: boolean; availability?: Record<'fabric' | 'quilt' | 'forge' | 'neoforge', boolean>; error?: string }>
      }
      instances: {
        list: () => Promise<{ id: string; name: string; mcVersion: string; loader: string; modpack?: boolean }[]>
        remove: (id: string) => Promise<{ success: boolean; error?: string }>
      }
      content: {
        search: (o: any) => Promise<{ success: boolean; items: any[]; total: number; error?: string }>
        install: (o: any) => Promise<{ success: boolean; installed: string[]; skipped: string[]; message?: string; instance?: any }>
        installed: (mc: string, loader: string, instanceId?: string) => Promise<{ success: boolean; mods?: { name: string; size: number }[]; resourcepacks?: { name: string; size: number }[]; shaders?: { name: string; size: number }[]; error?: string }>
        remove: (o: any) => Promise<{ success: boolean; error?: string }>
      }
      app: {
        openExternal: (url: string) => Promise<boolean>
      }
      java: {
        detect: (versionId: string) => Promise<{ success: boolean; javaPath?: string; error?: string }>
        download: (majorVersion: number) => Promise<{ success: boolean; javaPath?: string; error?: string }>
        deleteDownloaded: () => Promise<{ success: boolean; path?: string; error?: string }>
      }
      skins: {
        list: () => Promise<{ activeId: string | null; skins: { id: string; name: string }[] }>
        getActive: () => Promise<any>
        setActive: (id: string | null) => Promise<{ success: boolean; error?: string }>
        import: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>
        delete: (id: string) => Promise<{ success: boolean; error?: string }>
        getDataUrl: (id: string) => Promise<string | null>
        getActiveDataUrl: () => Promise<string | null>
      }
      settings: {
        get: () => Promise<any>
        save: (s: any) => Promise<{ success: boolean; error?: string }>
        selectDir: () => Promise<{ canceled: boolean; path?: string }>
        selectJava: () => Promise<{ canceled: boolean; path?: string }>
        getDefaultDir: () => Promise<string>
      }
      on: (channel: string, cb: (...args: any[]) => void) => (() => void) | undefined
      off: (channel: string, cb: (...args: any[]) => void) => void
    }
  }
}

export {}
