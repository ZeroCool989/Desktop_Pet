import type { PantherApi } from '@shared/types'

declare global {
  interface Window {
    panther: PantherApi
  }
}

export {}
