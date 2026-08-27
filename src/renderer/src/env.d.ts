/// <reference types="vite/client" />
import type { PreloadApi } from '@shared/types'

declare global {
  interface Window {
    api: PreloadApi
  }
}

export {}
