export class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private silentAudio: HTMLAudioElement | null = null;

  async acquire(): Promise<void> {
    // Try Wake Lock API first
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
        return;
      } catch {
        // Wake Lock failed (e.g., low battery, tab not visible)
        console.warn('Wake Lock failed, using audio fallback');
      }
    }

    // Fallback: play silent audio loop to keep screen awake
    this.silentAudio = new Audio(
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
    );
    this.silentAudio.loop = true;
    this.silentAudio.volume = 0.01;
    await this.silentAudio.play().catch(() => {});
  }

  async release(): Promise<void> {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio = null;
    }
  }

  isActive(): boolean {
    return this.wakeLock !== null || this.silentAudio !== null;
  }
}

export const wakeLockService = new WakeLockService();
