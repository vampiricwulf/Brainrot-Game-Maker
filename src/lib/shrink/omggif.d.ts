// The parts of omggif 1.0.10 (MIT, github.com/deanm/omggif) the app uses: reading a GIF's frames (gif.ts), and making
// one (gifwrite.ts, and the tests).
declare module 'omggif' {
  export interface GifFrameInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    has_local_palette: boolean;
    palette_offset: number | null;
    palette_size: number | null;
    data_offset: number;
    data_length: number;
    transparent_index: number | null;
    interlaced: boolean;
    /** Hundredths of a second. */
    delay: number;
    /** 0/1: kept, 2: its rectangle cleared, 3: what was there before put back. */
    disposal: number;
  }
  export class GifReader {
    constructor(buf: Uint8Array);
    width: number;
    height: number;
    numFrames(): number;
    loopCount(): number | null;
    frameInfo(frame: number): GifFrameInfo;
    /** Draws the frame over `pixels` (width × height × 4): its see-through pixels leave what's there. */
    decodeAndBlitFrameRGBA(frame: number, pixels: Uint8Array | Uint8ClampedArray): void;
  }
  export class GifWriter {
    constructor(buf: Uint8Array, width: number, height: number, opts?: { loop?: number; palette?: number[]; background?: number });
    addFrame(x: number, y: number, w: number, h: number, indexed: ArrayLike<number>, opts?: { palette?: number[]; delay?: number; disposal?: number; transparent?: number | null }): number;
    end(): number;
    /** Where the next byte goes in the buffer (set back to 0 once what's written is taken out). */
    getOutputBufferPosition(): number;
    setOutputBufferPosition(p: number): void;
  }
}
