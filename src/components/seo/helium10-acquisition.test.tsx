import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Helium10Acquisition from "./helium10-acquisition";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: "editor" } } }) }));
afterEach(() => vi.unstubAllGlobals());
describe("S2 direct keyword acquisition", () => {
  it("loads connection status and sends the selected marketplace into the review flow", async () => {
    const snapshot = { client: { keywords: [{ keyword_phrase: "tea", search_volume: 200 }], errors: [] }, competitors: [], marketplace: "UK", asins: [], competitorAsins: [], fetchedAt: "2026-09-09T12:00:00Z" };
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ connected: true }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ snapshot: null }) }).mockResolvedValueOnce({ ok: true, json: async () => snapshot });
    vi.stubGlobal("fetch", fetcher);
    const onResult = vi.fn();
    render(<Helium10Acquisition projectId="p" onResult={onResult} />);
    await screen.findByText("Helium 10 connected");
    fireEvent.change(screen.getByLabelText("Marketplace"), { target: { value: "UK" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch keywords" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(snapshot, false));
    expect(JSON.parse(fetcher.mock.calls[2][1].body).marketplace).toBe("UK");
  });
  it("heading shows the Helium 10 logo: navy for light mode, white for dark mode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ connected: true }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ snapshot: null }) }));
    render(<Helium10Acquisition projectId="p" onResult={vi.fn()} />);
    await screen.findByText("Helium 10 connected");
    const [light, dark] = screen.getAllByRole("img", { name: "Helium 10", hidden: true }) as HTMLImageElement[];
    expect(light.getAttribute("src")).toBe("/H10LogoLight.png");
    expect(light.className).toContain("dark:hidden");
    expect(dark.getAttribute("src")).toBe("/H10LogoDark.png");
    expect(dark.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "dark:block"]));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("Get keywords from");
  });
  it("shows fetch failures and leaves the review data untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ connected: true }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ snapshot: null }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Account limit reached" }) }));
    const onResult = vi.fn();
    render(<Helium10Acquisition projectId="p" onResult={onResult} />);
    await screen.findByText("Helium 10 connected");
    fireEvent.click(screen.getByRole("button", { name: "Fetch keywords" }));
    await screen.findByText("Account limit reached");
    expect(onResult).not.toHaveBeenCalled();
  });
});

it.each([true, false])("enables reconnect only when disconnected (connected=%s)", async connected => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ connected }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ snapshot: null }) }));
  render(<Helium10Acquisition projectId="p" onResult={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Reconnect Helium 10" })).toBeDisabled();
  await screen.findByText(connected ? "Helium 10 connected" : "Helium 10 disconnected");
  expect((screen.getByRole("button", { name: "Reconnect Helium 10" }) as HTMLButtonElement).disabled).toBe(connected);
});

it("starts reconnection directly for an SEO user and reports provider errors", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ connected: false }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ snapshot: null }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Provider unavailable" }) });
  vi.stubGlobal("fetch", fetcher);
  render(<Helium10Acquisition projectId="p" onResult={vi.fn()} />);
  await screen.findByText("Helium 10 disconnected");
  fireEvent.click(screen.getByRole("button", { name: "Reconnect Helium 10" }));
  await screen.findByText("Provider unavailable");
  expect(fetcher.mock.calls[2][0]).toBe("/api/seo/helium10");
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ projectId: "p" });
});
