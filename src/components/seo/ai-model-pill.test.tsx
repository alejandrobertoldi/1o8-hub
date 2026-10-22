import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectShell from "./project-shell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/seo/p", useParams: () => ({ id: "p" }) }));
afterEach(() => vi.unstubAllGlobals());

it("header shows the SEO AI model, with the per-step models on hover", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url === "/api/seo/ai-models"
      ? { summary: "Opus 4.7", steps: [{ step: "S2 Keywords", label: "Opus 4.7", enabled: true }, { step: "S6 Audit", label: "Opus 4.7", enabled: true }] }
      : { name: "P", brand_name: "B" },
  })));
  render(<ProjectShell projectId="p"><div /></ProjectShell>);
  const pill = await screen.findByLabelText("AI model: Opus 4.7");
  expect(pill.getAttribute("title")).toContain("S2 Keywords: Opus 4.7");
  expect(pill.getAttribute("title")).toContain("S6 Audit: Opus 4.7");
  expect(pill.className).toContain("text-[#D97757]");
});
