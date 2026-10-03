import { describe, expect, it } from "vitest";
import { FrameMeter, WINDOW_MS } from "./frameMeter";

/** Frames every `ms` from `from`, until `until`; returns the last frame's time. */
function run(meter: FrameMeter, from: number, ms: number, until: number): number {
  let t = from;
  for (; t <= until; t += ms) meter.frame(t);
  return t - ms;
}

describe("the frame meter", () => {
  it("gives the mean frame time over each second", () => {
    const meter = new FrameMeter();
    run(meter, 0, 16, 2000);
    expect(meter.frameMs).toBeCloseTo(16, 6);
    expect(meter.framesPerSecond).toBeCloseTo(62.5, 6);
  });

  it("counts slow frames as they are, however long", () => {
    const meter = new FrameMeter();
    run(meter, 0, 700, 5000);
    expect(meter.frameMs).toBeCloseTo(700, 6);
    expect(meter.framesPerSecond).toBeCloseTo(1000 / 700, 6);
  });

  it("averages a mixed window: one slow frame among fast ones", () => {
    const meter = new FrameMeter();
    meter.frame(0);
    meter.frame(400);
    const last = run(meter, 410, 10, WINDOW_MS);
    // 1 + 60 frames over 1,000 ms
    expect(last).toBe(1000);
    expect(meter.frameMs).toBeCloseTo(1000 / 61, 6);
  });

  it("does not count a hidden tab's pause as a frame", () => {
    const meter = new FrameMeter();
    const last = run(meter, 0, 20, 1500);
    meter.restart();
    run(meter, last + 30_000, 20, last + 30_000 + 1200);
    expect(meter.frameMs).toBeCloseTo(20, 6);
  });

  it("shows nothing until a window has ended", () => {
    const meter = new FrameMeter();
    run(meter, 0, 16, 900);
    expect(meter.frameMs).toBe(0);
  });
});
