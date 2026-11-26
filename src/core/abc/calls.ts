/**
 * Media channels of a managed call, engine-agnostic.
 * Audio is s16le PCM, 16 kHz, mono; video is H.264 Annex-B access units.
 */
export interface CallAudioStats {
  inFrames: number;
  outFrames: number;
  inPeak: number;
}

export interface CallAudioChannel {
  /** Peer audio, exactly 1920 bytes (960 samples, 60 ms) per frame */
  onFrame(listener: (pcm: Buffer) => void): void;
  onStats(listener: (stats: CallAudioStats) => void): void;
  /** Fires once when the call ends or the channel breaks */
  onEnd(listener: (error?: Error) => void): void;
  /** Agent audio, any even length; the engine re-cuts it into 960-sample frames */
  write(pcm: Buffer): void;
  flush(): void;
  close(): void;
}

export interface CallVideoFrame {
  accessUnit: Buffer;
  keyframe: boolean;
  orientation: number;
}

export interface CallVideoControl {
  type: string;
  active?: boolean;
  orientation?: number;
}

export interface CallVideoChannel {
  onFrame(listener: (frame: CallVideoFrame) => void): void;
  onControl(listener: (control: CallVideoControl) => void): void;
  onEnd(listener: (error?: Error) => void): void;
  send(accessUnit: Buffer, durationMs: number): void;
  setOrientation(orientation: number): void;
  close(): void;
}
