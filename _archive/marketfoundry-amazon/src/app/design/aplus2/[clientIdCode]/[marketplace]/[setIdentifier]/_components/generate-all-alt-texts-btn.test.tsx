import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GenerateAllAltTextsBtn,
  type BulkAltVersion,
} from "./generate-all-alt-texts-btn";
import type { ModuleDto } from "./aplus2-module-editor";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function module(overrides: Partial<ModuleDto> = {}): ModuleDto {
  return {
    id: "mod-1",
    position: 0,
    moduleType: "standard_image_text",
    status: "draft",
    headlineText: "Headline",
    subheadlineText: null,
    bodyText: "Body",
    overlayText: null,
    altText: "ReadyRESCUE vial on a blue field",
    mobileAltText: "ReadyRESCUE vial on a blue field",
    imageDescription: null,
    aiImagePrompt: null,
    cosmoRelationType: null,
    videoDriveFileId: null,
    videoTitle: null,
    videoDescription: null,
    textPosition: null,
    fontColor: null,
    figmaUrl: null,
    markupUrl: null,
    items: [],
    assets: [
      {
        id: "asset-desk",
        kind: "image",
        slotKey: "hero",
        variant: "desktop",
        driveFileId: "g1",
        filename: "hero.png",
        moduleId: "mod-1",
        moduleItemId: null,
      },
    ],
    ...overrides,
  };
}

function version(id: string, modules: ModuleDto[] = [module()]): BulkAltVersion {
  return { id, modules };
}

function renderBtn(id: string, modules?: ModuleDto[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerateAllAltTextsBtn v={version(id, modules)} setId="set-1" />
    </QueryClientProvider>
  );
}

describe("A+ GenerateAllAltTextsBtn version header", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders Edit suggestion immediately left of Generate Alt Text", () => {
    renderBtn(`ver-${Math.random()}`);
    const input = screen.getByRole("textbox", { name: "Edit suggestion" });
    const button = screen.getByRole("button", { name: /generate alt text/i });
    expect(input).toHaveClass("h-9", "rounded-full", "text-[13px]", "px-3");
    expect(input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends suggestion and currentAlt with every job and keeps the draft after remount", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ altText: "ReadyRESCUE vial with a golden retriever" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const versionId = `ver-${Math.random()}`;
    const { unmount } = renderBtn(versionId);

    fireEvent.change(screen.getByRole("textbox", { name: "Edit suggestion" }), {
      target: { value: "mention the golden retriever" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate alt text/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/aplus2/modules/mod-1",
        expect.objectContaining({ method: "PATCH" })
      )
    );

    const postBodies = fetchMock.mock.calls
      .filter(
        (call) =>
          call[0] === "/api/aplus2/ai/alt-text" &&
          (call[1] as RequestInit | undefined)?.method === "POST"
      )
      .map((call) => JSON.parse((call[1] as RequestInit).body as string));

    expect(postBodies).toHaveLength(1);
    expect(postBodies[0].suggestion).toBe("mention the golden retriever");
    expect(postBodies[0].currentAlt).toBe("ReadyRESCUE vial on a blue field");
    expect(postBodies[0].assetId).toBe("asset-desk");

    unmount();
    renderBtn(versionId);
    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toHaveValue(
      "mention the golden retriever"
    );
  });

  it("omits currentAlt and suggestion when the hint is empty, and skips filled alts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderBtn(`ver-${Math.random()}`);
    fireEvent.click(screen.getByRole("button", { name: /generate alt text/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate alt text/i })).not.toBeDisabled()
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generates missing alts without suggestion or currentAlt", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ altText: "generated" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderBtn(`ver-${Math.random()}`, [module({ altText: null, mobileAltText: null })]);
    fireEvent.click(screen.getByRole("button", { name: /generate alt text/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/aplus2/modules/mod-1",
        expect.objectContaining({ method: "PATCH" })
      )
    );

    const body = JSON.parse(
      (
        fetchMock.mock.calls.find(
          (call) => call[0] === "/api/aplus2/ai/alt-text"
        )?.[1] as RequestInit
      ).body as string
    );
    expect(body.suggestion).toBeUndefined();
    expect(body.currentAlt).toBeUndefined();
  });
});
