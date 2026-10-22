import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GenerateAllAltTextsBtn,
  type BulkAltVersion,
} from "./generate-all-alt-texts-btn";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function version(id: string): BulkAltVersion {
  return {
    id,
    desktopBgAlt: "Desktop background of a clinic",
    mobileBgAlt: "Mobile background of a clinic",
    bgDesktop: { driveFileId: "desk-1" },
    bgMobile: { driveFileId: "mob-1" },
    modules: [
      {
        id: "mod-1",
        type: "focus-image",
        headline: "First Response",
        body: "For pets",
        imageAlt: "Dr. Glassman holding a device",
        brandStoreId: null,
        focusAsset: { driveFileId: "focus-1" },
        logoAsset: null,
        asinItems: [],
        qaItems: [],
      },
    ],
  };
}

function renderBtn(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerateAllAltTextsBtn v={version(id)} clientIdCode="REA_SC_US" />
    </QueryClientProvider>
  );
}

describe("GenerateAllAltTextsBtn suggestion draft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the suggestion with every job and keeps it after remount", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ altText: "Clinic hero with a golden retriever" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const versionId = `ver-${Math.random()}`;
    const { unmount } = renderBtn(versionId);

    const input = screen.getByRole("textbox", { name: "Edit suggestion" });
    fireEvent.change(input, { target: { value: "mention the golden retriever" } });
    fireEvent.click(screen.getByRole("button", { name: /generate alt text/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/design-status/brand-story-versions/${versionId}`,
        expect.objectContaining({ method: "PATCH" })
      )
    );

    const postBodies = fetchMock.mock.calls
      .filter((call) => (call[1] as RequestInit | undefined)?.method === "POST")
      .map((call) => JSON.parse((call[1] as RequestInit).body as string));

    expect(postBodies).toHaveLength(3);
    for (const body of postBodies) {
      expect(body.suggestion).toBe("mention the golden retriever");
    }
    expect(postBodies[0].currentAlt).toBe("Desktop background of a clinic");
    expect(postBodies[2].currentAlt).toBe("Dr. Glassman holding a device");

    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toHaveValue(
      "mention the golden retriever"
    );

    unmount();
    renderBtn(versionId);
    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toHaveValue(
      "mention the golden retriever"
    );
  });

  it("omits currentAlt and suggestion when the hint is empty", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ altText: "generated" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const versionId = `ver-${Math.random()}`;
    renderBtn(versionId);
    fireEvent.click(screen.getByRole("button", { name: /generate alt text/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/design-status/brand-story-versions/${versionId}`,
        expect.objectContaining({ method: "PATCH" })
      )
    );

    const body = JSON.parse(
      (fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === "POST"
      )?.[1] as RequestInit).body as string
    );
    expect(body.suggestion).toBeUndefined();
    expect(body.currentAlt).toBeUndefined();
  });
});
