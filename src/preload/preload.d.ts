import type { NexusAPI } from './preload'

declare global {
  interface Window {
    nexus: NexusAPI
  }
}

export {}
