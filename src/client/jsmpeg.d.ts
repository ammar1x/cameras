declare class JSMpeg {
  static Player: new (
    url: string,
    options: {
      canvas: HTMLCanvasElement;
      autoplay?: boolean;
      audio?: boolean;
      loop?: boolean;
      onSourceEstablished?: () => void;
      onSourceCompleted?: () => void;
    }
  ) => JSMpegPlayer;
}

interface JSMpegPlayer {
  destroy(): void;
  play(): void;
  pause(): void;
  stop(): void;
  volume: number;
}

declare global {
  interface Window {
    JSMpeg: typeof JSMpeg;
  }
}

export { JSMpeg, JSMpegPlayer };
