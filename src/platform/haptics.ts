import type { HapticsPort } from '../application/ports'

export class WebHaptics implements HapticsPort {
  enabled = true
  vibrate(pattern: number | number[]): void {
    if (this.enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  }
}
