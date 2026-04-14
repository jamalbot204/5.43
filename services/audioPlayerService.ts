
import * as Tone from 'tone';

interface PlaybackOptions {
  playbackRate: number;
  grainSize?: number;
  overlap?: number;
  onTimeUpdate: (currentTime: number) => void;
  onEnded: () => void;
}

class AudioPlayerService {
  private grainPlayer: Tone.GrainPlayer | null = null;
  private animationFrameId: number | null = null;
  private endTimeoutId: number | null = null;
  private anchorToneTime: number = 0;
  private anchorOffset: number = 0;
  private currentDuration: number = 0;
  private isPlaying: boolean = false;
  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;

  constructor() {
    // Initialize methods or listeners if needed
  }

  /**
   * Initializes the Audio Context (must be called after user interaction).
   */
  async initialize() {
    // Tone is imported statically, so we just start the context
    await Tone.start();
    if (Tone.context.state === 'suspended') {
      await Tone.context.resume();
    }
  }

  /**
   * Decodes raw audio data using Tone.js context.
   */
  async decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    // We clone the buffer because decodeAudioData might detach it
    // Note: Tone.context.rawContext is the native AudioContext
    return await (Tone.context.rawContext as AudioContext).decodeAudioData(audioData.slice(0));
  }

  /**
   * Gets the raw AudioContext (useful for legacy decoding if needed).
   */
  getRawContext(): AudioContext {
    return Tone.context.rawContext as AudioContext;
  }

  /**
   * Returns the precise current playback time.
   * Calculates based on audio context time for high precision (Option C).
   */
  public getCurrentTime(): number {
    if (!this.isPlaying || !this.grainPlayer) {
        return this.anchorOffset;
    }
    const currentToneTime = Tone.now();
    const playbackRate = this.grainPlayer.playbackRate;
    const elapsed = currentToneTime - this.anchorToneTime;
    const currentPos = this.anchorOffset + (elapsed * playbackRate);
    
    // Ensure we don't return a value past the duration
    return Math.min(Math.max(0, currentPos), this.currentDuration);
  }

  /**
   * Starts playback of an audio buffer.
   */
  async play(buffer: AudioBuffer, startTimeOffset: number, options: PlaybackOptions) {
    await this.initialize();

    this._cleanup(); // Stop any existing playback

    this.currentDuration = buffer.duration;
    this.onTimeUpdateCallback = options.onTimeUpdate;
    this.onEndedCallback = options.onEnded;

    this.grainPlayer = new Tone.GrainPlayer(buffer);
    
    // Dynamic settings for tuning
    this.grainPlayer.grainSize = options.grainSize ?? 0.2; 
    this.grainPlayer.overlap = options.overlap ?? 0.1;
    this.grainPlayer.loop = false;
    this.grainPlayer.detune = 0;
    this.grainPlayer.playbackRate = options.playbackRate;
    this.grainPlayer.toDestination();

    const safeStartTimeOffset = Math.max(0, Math.min(startTimeOffset, this.currentDuration));
    const playDuration = this.currentDuration - safeStartTimeOffset;
    const scaledDuration = playDuration / options.playbackRate;

    const now = Tone.now();
    this.anchorToneTime = now;
    this.anchorOffset = safeStartTimeOffset;
    this.isPlaying = true;

    // BUGFIX for Tone.js GrainPlayer: 
    // GrainPlayer internally multiplies the offset by playbackRate.
    // To start at the correct buffer position, we MUST divide the offset by playbackRate.
    // The duration parameter is in real-time, so we pass scaledDuration.
    this.grainPlayer.start(now, safeStartTimeOffset / options.playbackRate, scaledDuration);
    
    // Set a backup timeout to ensure onEnded fires even if requestAnimationFrame is throttled (background tab)
    // Add small buffer (100ms) to allow visual loop to finish naturally if active
    this.endTimeoutId = window.setTimeout(() => {
        this.handlePlaybackComplete();
    }, scaledDuration * 1000 + 100);

    this.startProgressLoop();
  }

  /**
   * Stops playback and cleans up resources.
   */
  stop() {
    this._cleanup();
  }

  /**
   * Internal cleanup method.
   */
  private _cleanup() {
    if (this.grainPlayer) {
      try {
        this.grainPlayer.stop();
        this.grainPlayer.dispose();
      } catch (e) {
        console.warn("Error disposing grain player", e);
      }
      this.grainPlayer = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.endTimeoutId) {
      clearTimeout(this.endTimeoutId);
      this.endTimeoutId = null;
    }
    this.isPlaying = false;
    this.onTimeUpdateCallback = null;
    this.onEndedCallback = null;
  }

  /**
   * Sets the playback rate dynamically.
   */
  setPlaybackRate(rate: number) {
    if (this.grainPlayer) {
      const currentVisualTime = this.getCurrentTime();
      this.grainPlayer.playbackRate = rate;
      
      const now = Tone.now();
      this.anchorToneTime = now;
      this.anchorOffset = currentVisualTime;

      if (this.isPlaying) {
          const playDuration = this.currentDuration - currentVisualTime;
          const scaledDuration = playDuration / rate;
          
          // Restart the player to reschedule the correct stop time based on the new rate
          this.grainPlayer.stop();
          // BUGFIX for Tone.js GrainPlayer: 
          // Divide offset by rate to counteract GrainPlayer's internal multiplication.
          // Pass scaledDuration for real-time stop scheduling.
          this.grainPlayer.start(now, currentVisualTime / rate, scaledDuration);
          
          // Reset backup timeout with new rate
          if (this.endTimeoutId) {
              clearTimeout(this.endTimeoutId);
              this.endTimeoutId = null;
          }
          this.endTimeoutId = window.setTimeout(() => {
              this.handlePlaybackComplete();
          }, scaledDuration * 1000 + 100);
      }
    }
  }

  /**
   * Sets the grain size dynamically.
   */
  setGrainSize(size: number) {
    if (this.grainPlayer) {
      this.grainPlayer.grainSize = size;
    }
  }

  /**
   * Sets the overlap dynamically.
   */
  setOverlap(overlap: number) {
    if (this.grainPlayer) {
      this.grainPlayer.overlap = overlap;
    }
  }

  private handlePlaybackComplete() {
      if (!this.isPlaying) return;
      
      // Capture callbacks before cleanup to avoid null reference
      const onEnded = this.onEndedCallback;
      const onTimeUpdate = this.onTimeUpdateCallback;
      
      this._cleanup();
      
      if (onTimeUpdate) onTimeUpdate(this.currentDuration);
      if (onEnded) onEnded();
  }

  /**
   * Internal loop to track progress and detect end of playback.
   */
  private startProgressLoop() {
    const loop = () => {
      if (!this.isPlaying || !this.grainPlayer) return;

      const currentToneTime = Tone.now();
      const playbackRate = this.grainPlayer.playbackRate;
      const elapsed = currentToneTime - this.anchorToneTime;
      const currentPos = this.anchorOffset + (elapsed * playbackRate);

      // Check for end (with a small buffer)
      if (currentPos >= this.currentDuration - 0.05) {
        this.handlePlaybackComplete();
      } else {
        if (this.onTimeUpdateCallback) this.onTimeUpdateCallback(currentPos);
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }
}

export const audioPlayerService = new AudioPlayerService();
