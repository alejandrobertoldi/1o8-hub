import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrandStoryEditor,
  CopyTextButton,
  GenerateAltTextBtn,
  type BrandStoryEditorInitial,
} from "./brand-story-editor";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderBtn(
  slotId: string,
  onComplete: (results: string[]) => void = vi.fn()
) {
  return render(
    <GenerateAltTextBtn
      versionId="ver-1"
      slotId={slotId}
      getJobs={() => [
        {
          moduleType: "focus-image",
          currentAlt: "Dr. Glassman holding a device",
        },
      ]}
      onComplete={onComplete}
    />
  );
}

describe("BrandStoryEditor ModuleCard header", () => {
  it("puts Edit suggestion and Alt text between the type pill and the bin", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const initial: BrandStoryEditorInitial = {
      desktopBgAlt: "",
      mobileBgAlt: "",
      bgDesktop: null,
      bgMobile: null,
      modules: [
        {
          id: "mod-1",
          position: 1,
          type: "focus-image",
          headline: null,
          body: null,
          imageAlt: "Focus alt",
          brandStoreId: null,
          focusAsset: { id: "a1", driveFileId: "d1", filename: "focus.png" },
          logoAsset: null,
          asinItems: [],
          qaItems: [],
        },
      ],
    };
    render(
      <QueryClientProvider client={queryClient}>
        <BrandStoryEditor
          versionId="ver-1"
          clientIdCode="REA_SC_US"
          initial={initial}
        />
      </QueryClientProvider>
    );

    const index = screen.getByText("#1");
    const header = index.closest("div");
    expect(header).toBeTruthy();
    const scoped = within(header!);
    expect(scoped.getByText("Brand Focus Image")).toBeInTheDocument();
    const suggestion = scoped.getByRole("textbox", { name: "Edit suggestion" });
    expect(suggestion.closest("div")).toHaveClass("min-w-0", "flex-1");
    expect(suggestion.closest("div")).not.toHaveClass("w-1/2");
    expect(scoped.getByRole("button", { name: "Alt text" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "Remove module" })).toBeInTheDocument();
  });
});

describe("GenerateAltTextBtn suggestion draft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the edit suggestion after generate finishes and the button remounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ altText: "Dr. Glassman with a golden retriever" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const onComplete = vi.fn();
    const slotId = `module-${Math.random()}`;
    const { unmount } = renderBtn(slotId, onComplete);

    const input = screen.getByRole("textbox", { name: "Edit suggestion" });
    fireEvent.change(input, { target: { value: "mention the golden retriever" } });
    fireEvent.click(screen.getByRole("button", { name: /alt text/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([
      "Dr. Glassman with a golden retriever",
    ]));
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.suggestion).toBe("mention the golden retriever");
    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toHaveValue(
      "mention the golden retriever"
    );

    unmount();
    renderBtn(slotId);
    expect(screen.getByRole("textbox", { name: "Edit suggestion" })).toHaveValue(
      "mention the golden retriever"
    );
  });
});

describe("CopyTextButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("copies the alt text and switches to a copied state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(
      <CopyTextButton
        value="ReadyRESCUE detoxifier vial activated in water"
        label="Image alt text"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Image alt text" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "ReadyRESCUE detoxifier vial activated in water"
      )
    );
    expect(
      screen.getByRole("button", { name: "Image alt text copied" })
    ).toBeInTheDocument();
  });

  it("is disabled when there is nothing to copy", () => {
    render(<CopyTextButton value="" label="Image alt text" />);
    expect(screen.getByRole("button", { name: "Copy Image alt text" })).toBeDisabled();
  });
});
