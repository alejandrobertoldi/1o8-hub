import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Aplus2ImageSlot } from "./aplus2-image-slot";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const spec = {
  key: "hero",
  label: "Hero",
  desktopSize: { width: 970, height: 600 },
};

const asset = {
  id: "asset-1",
  slotKey: "hero",
  variant: "desktop" as const,
  driveFileId: "g1",
  filename: "hero.png",
  moduleId: "mod-1",
  moduleItemId: null,
};

function renderSlot(
  altText: string,
  onCommit: (value: string) => void = vi.fn(),
  moduleId = "mod-1"
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Aplus2ImageSlot
        spec={spec}
        assets={[{ ...asset, moduleId }]}
        versionId="ver-1"
        moduleId={moduleId}
        altText={altText}
        onAltTextChange={vi.fn()}
        onAltTextCommit={onCommit}
      />
    </QueryClientProvider>
  );
}

describe("Aplus2ImageSlot aspect ratio", () => {
  it("sizes desktop and mobile cards to their own expected dimensions", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Aplus2ImageSlot
          spec={{
            key: "background_image",
            label: "Background image",
            desktopSize: { width: 1464, height: 600 },
            mobileSize: { width: 600, height: 450 },
          }}
          assets={[]}
          versionId="ver-1"
          moduleId="mod-1"
        />
      </QueryClientProvider>
    );

    const desktopLabel = screen.getByText("desktop · 1464×600");
    const mobileLabel = screen.getByText("mobile · 600×450");
    const desktopCard = desktopLabel.nextElementSibling;
    const mobileCard = mobileLabel.nextElementSibling;
    expect(desktopCard).toHaveStyle({ aspectRatio: "1464 / 600" });
    expect(mobileCard).toHaveStyle({ aspectRatio: "600 / 450" });
    expect(desktopCard).toHaveClass("w-full");
    expect(mobileCard).toHaveClass("w-full");
    expect(desktopLabel.parentElement).toHaveStyle({ flexGrow: String(1464 / 600) });
    expect(mobileLabel.parentElement).toHaveStyle({ flexGrow: String(600 / 450) });
  });
});

describe("Aplus2ImageSlot alt text", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a three-line alt text field and an edit suggestion input", () => {
    renderSlot("ReadyRESCUE vial on a blue field");
    const alt = screen.getByRole("textbox", { name: "Alt text" });
    expect(alt.tagName).toBe("TEXTAREA");
    expect(alt).toHaveAttribute("rows", "3");
    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alt text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Alt text" })).toBeInTheDocument();
  });

  it("hides suggestion and generate when hideGenerate is set", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Aplus2ImageSlot
          spec={spec}
          assets={[asset]}
          versionId="ver-1"
          moduleId="mod-1"
          altText="ReadyRESCUE vial on a blue field"
          onAltTextChange={vi.fn()}
          hideGenerate
        />
      </QueryClientProvider>
    );
    expect(screen.getByRole("textbox", { name: "Alt text" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit suggestion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alt text" })).not.toBeInTheDocument();
  });

  it("keeps the edit suggestion after generate remounts the slot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ altText: "ReadyRESCUE vial with a golden retriever" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const onCommit = vi.fn();
    const moduleId = `mod-${Math.random()}`;
    const { unmount } = renderSlot("old alt", onCommit, moduleId);

    fireEvent.change(screen.getByRole("textbox", { name: "Edit suggestion" }), {
      target: { value: "mention the golden retriever" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Alt text" }));

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith("ReadyRESCUE vial with a golden retriever")
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.suggestion).toBe("mention the golden retriever");
    expect(body.currentAlt).toBe("old alt");

    unmount();
    renderSlot("ReadyRESCUE vial with a golden retriever", vi.fn(), moduleId);
    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toHaveValue(
      "mention the golden retriever"
    );
  });
});
