import { describe, expect, it } from "vitest";
import {
  OPAL_DAMP,
  OPAL_LEAD_K,
  Spring,
  beadClipPath,
  beadClipPathY,
  beadSquash,
  faceClipPath,
  faceClipPathY,
  paintOpalBead,
  pickOpalTarget,
} from "./opal-nav";

describe("Spring", () => {
  it("snaps to a value with zero velocity", () => {
    const s = new Spring(OPAL_LEAD_K, 0.9, 0);
    s.snap(40);
    expect(s.x).toBe(40);
    expect(s.target).toBe(40);
    expect(s.v).toBe(0);
  });

  it("moves toward the target over successive steps", () => {
    const s = new Spring(OPAL_LEAD_K, 0.9, 0);
    s.target = 100;
    for (let i = 0; i < 40; i++) s.step(1 / 60);
    expect(s.x).toBeGreaterThan(80);
    expect(Math.abs(s.x - 100)).toBeLessThan(5);
  });

  it("does not overshoot the target", () => {
    const s = new Spring(OPAL_LEAD_K, OPAL_DAMP, 0);
    s.target = 100;
    for (let i = 0; i < 120; i++) {
      s.step(1 / 60);
      expect(s.x).toBeLessThanOrEqual(100);
    }
    expect(s.x).toBe(100);
    expect(s.v).toBe(0);
  });
});

describe("beadSquash", () => {
  it("stays at 1 when width matches rest", () => {
    expect(beadSquash(80, 80)).toBe(1);
  });

  it("drops below 1 when the bead stretches", () => {
    const sq = beadSquash(160, 80);
    expect(sq).toBeLessThan(1);
    expect(sq).toBeGreaterThanOrEqual(0.72);
  });
});

describe("beadClipPath", () => {
  it("insets from both edges so the pill sits on the active item", () => {
    expect(beadClipPath(10, 90, 200, 5)).toBe(
      "inset(5px 110px 5px 10px round 999px)",
    );
  });
});

describe("faceClipPath", () => {
  it("hides the neon face when the bead does not overlap", () => {
    expect(faceClipPath(100, 40, 0, 50)).toBe("inset(0 100% 0 0)");
  });

  it("reveals the overlap window when the bead covers part of the item", () => {
    // item 20–80, bead 0–50 → clip left 0, clip right 30
    expect(faceClipPath(20, 60, 0, 50)).toBe("inset(0 30px 0 0px)");
  });
});

describe("pickOpalTarget", () => {
  const items = [
    { hover: false, open: false, active: true },
    { hover: false, open: false, active: false },
    { hover: false, open: false, active: false },
  ];

  it("uses the active page when nothing is hovered", () => {
    expect(pickOpalTarget(items)).toBe(0);
  });

  it("moves the pill to the hovered item and leaves the active page", () => {
    expect(pickOpalTarget([
      { hover: false, active: true },
      { hover: true, active: false },
      { hover: false, active: false },
    ])).toBe(1);
  });

  it("keeps the pill on an open dropdown after the pointer leaves the trigger", () => {
    expect(pickOpalTarget([
      { hover: false, open: false, active: true },
      { hover: false, open: true, active: false },
    ])).toBe(1);
  });
});

describe("paintOpalBead", () => {
  it("returns a clip for the bead and each item face", () => {
    const painted = paintOpalBead({
      trackWidth: 400,
      edgeL: 20,
      edgeR: 100,
      restWidth: 80,
      items: [
        { left: 20, width: 80 },
        { left: 100, width: 80 },
      ],
    });
    expect(painted.beadClip).toBe("inset(5px 300px 5px 20px round 999px)");
    expect(painted.squash).toBe(1);
    expect(painted.faceClips[0]).toBe("inset(0 0px 0 0px)");
    expect(painted.faceClips[1]).toBe("inset(0 100% 0 0)");
  });

  it("clips a vertical pill for dropdown options", () => {
    const painted = paintOpalBead({
      trackWidth: 200,
      edgeL: 10,
      edgeR: 50,
      restWidth: 40,
      axis: "y",
      items: [
        { left: 10, width: 40 },
        { left: 50, width: 40 },
      ],
    });
    expect(painted.beadClip).toBe(beadClipPathY(10, 50, 200, 5));
    expect(painted.faceClips[0]).toBe("inset(0px 0 0px 0)");
    expect(painted.faceClips[1]).toBe("inset(100% 0 0 0)");
  });
});

describe("beadClipPathY", () => {
  it("insets top and bottom so the pill sits on the option", () => {
    expect(beadClipPathY(10, 50, 200, 6)).toBe(
      "inset(10px 6px 150px 6px round 999px)",
    );
  });
});

describe("faceClipPathY", () => {
  it("hides the neon face when the vertical bead does not overlap", () => {
    expect(faceClipPathY(80, 40, 0, 50)).toBe("inset(100% 0 0 0)");
  });
});
