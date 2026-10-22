import { describe, expect, it } from "vitest";
import { normalizeSocial } from "./web-social";

describe("normalizeSocial", () => {
  it("keeps full URLs and empties", () => {
    expect(normalizeSocial("Instagram", "https://instagram.com/mission")).toBe("https://instagram.com/mission");
    expect(normalizeSocial("Instagram", "  ")).toBe("");
  });
  it("turns handles into the network URL", () => {
    expect(normalizeSocial("Instagram", "@mission")).toBe("https://instagram.com/mission");
    expect(normalizeSocial("TikTok", "mission")).toBe("https://tiktok.com/@mission");
  });
  it("adds https to bare domains", () => {
    expect(normalizeSocial("BrandURL", "www.mission.com")).toBe("https://www.mission.com");
    expect(normalizeSocial("Facebook", "facebook.com/mission")).toBe("https://facebook.com/mission");
  });
});
