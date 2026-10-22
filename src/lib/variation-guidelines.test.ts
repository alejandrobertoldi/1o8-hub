import { describe, it, expect } from "vitest";
import {
  isGuidelinesPresent,
  resolveGuidelines,
  resolveGuidelinesFieldByField,
  renderGuidelinesBlock,
  type ContentGuidelines,
  type GuidelineTierMap,
} from "./variation-guidelines";

describe("isGuidelinesPresent", () => {
  it("returns false for null", () => expect(isGuidelinesPresent(null)).toBe(false));
  it("returns false for empty object", () => expect(isGuidelinesPresent({})).toBe(false));
  it("returns false for all empty arrays", () =>
    expect(isGuidelinesPresent({ keyFeatures: [], messagingAngle: [], doList: [] })).toBe(false));
  it("returns true when keyFeatures has items", () =>
    expect(isGuidelinesPresent({ keyFeatures: ["organic"] })).toBe(true));
  it("returns true when messagingAngle is set", () =>
    expect(isGuidelinesPresent({ messagingAngle: ["Lead with sleep benefits"] })).toBe(true));
});

describe("resolveGuidelines", () => {
  const groupGl: ContentGuidelines = { messagingAngle: ["from group"] };
  const varGl: ContentGuidelines = { messagingAngle: ["from variation"] };

  it("returns group guidelines when present", () =>
    expect(resolveGuidelines(groupGl, varGl)).toEqual({ messagingAngle: ["from group"] }));
  it("falls back to variation when group is empty", () =>
    expect(resolveGuidelines({}, varGl)).toEqual({ messagingAngle: ["from variation"] }));
  it("returns null when both are empty", () =>
    expect(resolveGuidelines(null, null)).toBeNull());
});

describe("resolveGuidelinesFieldByField", () => {
  const listing:   ContentGuidelines = { messagingAngle: ["listing angle"], keyFeatures: ["listing-feat"] };
  const group:     ContentGuidelines = { messagingAngle: ["group angle"],   targetAudience: ["group audience"], keyFeatures: ["group-feat"] };
  const variation: ContentGuidelines = { messagingAngle: ["var angle"],     targetAudience: ["var audience"],   doList: ["var-do"] };

  it("listing wins for each field it sets", () => {
    const r = resolveGuidelinesFieldByField(listing, group, variation)!;
    expect(r.messagingAngle).toEqual(["listing angle"]);
    expect(r.keyFeatures).toEqual(["listing-feat"]);
  });

  it("group wins when listing field is absent", () => {
    const r = resolveGuidelinesFieldByField(listing, group, variation)!;
    expect(r.targetAudience).toEqual(["group audience"]);
  });

  it("variation wins when listing and group field are absent", () => {
    const r = resolveGuidelinesFieldByField(listing, group, variation)!;
    expect(r.doList).toEqual(["var-do"]);
  });

  it("returns null when all inputs are empty", () =>
    expect(resolveGuidelinesFieldByField(null, null, null)).toBeNull());

  it("returns null when all inputs are empty objects", () =>
    expect(resolveGuidelinesFieldByField({}, {}, {})).toBeNull());

  it("each field is resolved independently (no full-tier override)", () => {
    const g: ContentGuidelines = { messagingAngle: ["g-angle"] };
    const v: ContentGuidelines = { targetAudience: ["v-audience"], doList: ["v-do"] };
    const r = resolveGuidelinesFieldByField(null, g, v)!;
    expect(r.messagingAngle).toEqual(["g-angle"]);
    expect(r.targetAudience).toEqual(["v-audience"]);
    expect(r.doList).toEqual(["v-do"]);
  });

  it("backward-compat: resolveGuidelines delegates to field-by-field with null listing", () => {
    const g: ContentGuidelines = { messagingAngle: ["g"] };
    const v: ContentGuidelines = { targetAudience: ["v"] };
    const r = resolveGuidelines(g, v)!;
    expect(r.messagingAngle).toEqual(["g"]);
    expect(r.targetAudience).toEqual(["v"]);
  });

  it("brand tier fills fields no higher tier provides", () => {
    const brand:     ContentGuidelines = { dontList: ["brand-dont"], targetAudience: ["brand-audience"] };
    const variation: ContentGuidelines = { messagingAngle: ["var angle"] };
    const r = resolveGuidelinesFieldByField(null, null, variation, brand)!;
    expect(r.messagingAngle).toEqual(["var angle"]);
    expect(r.dontList).toEqual(["brand-dont"]);
    expect(r.targetAudience).toEqual(["brand-audience"]);
  });

  it("variation/group/listing always beat brand for the same field", () => {
    const brand:     ContentGuidelines = { messagingAngle: ["brand angle"] };
    const variation: ContentGuidelines = { messagingAngle: ["var angle"] };
    const r = resolveGuidelinesFieldByField(null, null, variation, brand)!;
    expect(r.messagingAngle).toEqual(["var angle"]);
  });

  it("brand-only input still resolves", () => {
    const brand: ContentGuidelines = { keyFeatures: ["brand-feat"] };
    const r = resolveGuidelinesFieldByField(null, null, null, brand)!;
    expect(r.keyFeatures).toEqual(["brand-feat"]);
  });
});

describe("renderGuidelinesBlock", () => {
  it("includes all populated fields", () => {
    const gl: ContentGuidelines = {
      messagingAngle: ["Lead with sleep", "Emphasise relaxation"],
      targetAudience: ["Adults 25-45"],
      keyFeatures: ["vegan", "organic"],
      doList: ["Use sensory language"],
      dontList: ["Avoid price talk"],
    };
    const block = renderGuidelinesBlock(gl);
    expect(block).toContain("## SOURCE FACTS");
    expect(block).toContain("Lead with sleep");
    expect(block).toContain("Adults 25-45");
    expect(block).toContain("vegan, organic");
    expect(block).toContain("Use sensory language");
    expect(block).toContain("Avoid price talk");
  });

  it("omits lines for missing fields", () => {
    const block = renderGuidelinesBlock({ messagingAngle: ["Only angle"] });
    expect(block).not.toContain("Target audience:");
    expect(block).not.toContain("Key features:");
  });

  it("renders as SOURCE FACTS block with tier annotations when tier map provided", () => {
    const gl: ContentGuidelines = {
      messagingAngle: ["Lead with sleep"],
      keyFeatures: ["organic", "vegan"],
      dontList: ["Avoid price talk"],
    };
    const tiers: GuidelineTierMap = {
      messagingAngle: "listing" as const,
      keyFeatures: "variation" as const,
      dontList: "brand" as const,
    };
    const block = renderGuidelinesBlock(gl, tiers);
    expect(block).toContain("## SOURCE FACTS");
    expect(block).toContain("Messaging angle [listing]:");
    expect(block).toContain("Key features [variation]:");
    expect(block).toContain("Don't [brand]:");
  });

  it("backward-compat: omits tier annotations when no tier map provided", () => {
    const block = renderGuidelinesBlock({ messagingAngle: ["x"] });
    expect(block).toContain("## SOURCE FACTS");
    expect(block).toContain("Messaging angle: x");
    expect(block).not.toContain("[listing]");
  });
});
