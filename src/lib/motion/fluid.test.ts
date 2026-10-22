import { describe, expect, it } from "vitest";
import {
  GESTURE_HYSTERESIS_PX,
  clamp,
  originFromRects,
  panLimits,
  pastHysteresis,
  project,
  rubberband,
  rubberbandRange,
  settlePan,
  stepToward,
  velocityFromSamples,
} from "./fluid";

describe("pastHysteresis", () => {
  it("ignores sub-threshold jitter", () => {
    expect(pastHysteresis(6, 6)).toBe(false);
  });

  it("commits once movement reaches 10px", () => {
    expect(pastHysteresis(GESTURE_HYSTERESIS_PX, 0)).toBe(true);
    expect(pastHysteresis(8, 8)).toBe(true);
  });
});

describe("rubberband", () => {
  it("returns less than the raw overshoot", () => {
    const resisted = rubberband(100, 400);
    expect(resisted).toBeGreaterThan(0);
    expect(resisted).toBeLessThan(100);
  });

  it("increases as overshoot grows, with diminishing follow", () => {
    const a = rubberband(40, 400);
    const b = rubberband(80, 400);
    expect(b).toBeGreaterThan(a);
    expect(b / a).toBeLessThan(2);
  });
});

describe("project", () => {
  it("projects a 1000px/s flick forward", () => {
    const distance = project(1000);
    expect(distance).toBeGreaterThan(400);
    expect(distance).toBeLessThan(600);
  });

  it("is zero at rest", () => {
    expect(project(0)).toBe(0);
  });
});

describe("rubberbandRange", () => {
  it("passes values inside the range through", () => {
    expect(rubberbandRange(50, 0, 100, 400)).toBe(50);
  });

  it("resists past the max instead of hard-stopping", () => {
    const past = rubberbandRange(150, 0, 100, 400);
    expect(past).toBeGreaterThan(100);
    expect(past).toBeLessThan(150);
  });
});

describe("originFromRects", () => {
  it("falls back to center when there is no trigger", () => {
    expect(
      originFromRects(null, { left: 100, top: 80, width: 400, height: 300 }),
    ).toBe("center center");
  });

  it("anchors to the trigger's center in content-local coordinates", () => {
    expect(
      originFromRects(
        { left: 40, top: 20, width: 80, height: 40 },
        { left: 100, top: 80, width: 400, height: 300 },
      ),
    ).toBe("-20px -40px");
  });
});

describe("velocityFromSamples", () => {
  it("returns px/s from the last two samples", () => {
    expect(
      velocityFromSamples([
        { t: 0, x: 0, y: 0 },
        { t: 100, x: 50, y: -20 },
      ]),
    ).toEqual({ x: 500, y: -200 });
  });
});

describe("panLimits + settlePan", () => {
  it("clamps a projected flick onto the allowed pan range", () => {
    const limits = panLimits(
      { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
      { width: 400, height: 300 },
      1,
      48,
    );
    const settled = settlePan({ x: -100, y: -50 }, { x: -2000, y: 0 }, limits);
    expect(settled.x).toBe(limits.minX);
    expect(settled.y).toBeGreaterThanOrEqual(limits.minY);
    expect(settled.y).toBeLessThanOrEqual(limits.maxY);
  });
});

describe("clamp", () => {
  it("centers when the allowed range is inverted", () => {
    expect(clamp(0, 40, 10)).toBe(25);
  });
});

describe("stepToward", () => {
  it("settles on the target without overshooting", () => {
    let x = 0;
    for (let i = 0; i < 120; i++) x = stepToward(x, 100, 1 / 60);
    expect(x).toBe(100);
  });
});
