// The frame time (PLAN, PF3–PF4): frames counted over windows of WINDOW_MS,
// the window's length divided by its frames. Every frame counts, however long
// it takes, so a slow machine shows its real frame time. A hidden tab draws no
// frames; restart() (on hiding) makes the pause start no window, so it never
// counts as one long frame.

/** How long each window runs, ms. */
export const WINDOW_MS = 1000;

export class FrameMeter {
  /** The last whole window's mean frame time, ms; 0 until one has ended. */
  frameMs = 0;
  /** The last whole window's frames per second. */
  framesPerSecond = 0;
  private start: number | null = null;
  private frames = 0;

  /** Counts a frame drawn at `time`, ms; returns whether a window has just ended. */
  frame(time: number): boolean {
    if (this.start === null) {
      this.start = time;
      this.frames = 0;
      return false;
    }
    this.frames++;
    const elapsed = time - this.start;
    if (elapsed < WINDOW_MS) return false;
    this.frameMs = elapsed / this.frames;
    this.framesPerSecond = (1000 * this.frames) / elapsed;
    this.start = time;
    this.frames = 0;
    return true;
  }

  /** Forgets the window under way: the next frame starts a new one. */
  restart(): void {
    this.start = null;
  }
}
