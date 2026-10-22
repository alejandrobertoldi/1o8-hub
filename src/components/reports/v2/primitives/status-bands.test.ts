import { describe, it, expect } from "vitest";
import { classifyRoas, classifyAcos } from "./status-bands";

describe("classifyRoas", () => {
  it("good at/above 4.0", () => { expect(classifyRoas(4.0)).toBe("good"); expect(classifyRoas(25.58)).toBe("good"); });
  it("warn from 2.0 to just under 4.0", () => { expect(classifyRoas(2.0)).toBe("warn"); expect(classifyRoas(3.99)).toBe("warn"); });
  it("bad below 2.0", () => { expect(classifyRoas(1.99)).toBe("bad"); expect(classifyRoas(0.38)).toBe("bad"); });
  it("zero or null → none (zero-conversion '—')", () => { expect(classifyRoas(0)).toBe("none"); expect(classifyRoas(null)).toBe("none"); });
});

describe("classifyAcos (percent points)", () => {
  it("good at/below 25%", () => { expect(classifyAcos(25)).toBe("good"); expect(classifyAcos(3.91)).toBe("good"); });
  it("warn above 25% up to 60%", () => { expect(classifyAcos(25.01)).toBe("warn"); expect(classifyAcos(60)).toBe("warn"); });
  it("bad above 60%", () => { expect(classifyAcos(60.01)).toBe("bad"); expect(classifyAcos(262.87)).toBe("bad"); });
  it("null → none (zero-revenue '—')", () => { expect(classifyAcos(null)).toBe("none"); });
});
