import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Aplus2ModuleEditor, type ModuleDto } from "./aplus2-module-editor";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const moduleDto: ModuleDto = {
  id: "mod-1",
  position: 1,
  moduleType: "full_image",
  status: "draft",
  headlineText: null,
  subheadlineText: null,
  bodyText: null,
  overlayText: null,
  altText: "Peanut butter jar on marble",
  mobileAltText: "Peanut butter jar on marble",
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
      id: "asset-1",
      kind: "image",
      slotKey: "main_image",
      variant: "desktop",
      driveFileId: "g1",
      filename: "hero.png",
      moduleId: "mod-1",
      moduleItemId: null,
    },
  ],
};

describe("Aplus2ModuleEditor header", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pills M01 / type / trash and moves generate into the header", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Aplus2ModuleEditor module={moduleDto} versionId="ver-1" />
      </QueryClientProvider>
    );

    const index = screen.getByText("M01");
    expect(index).toHaveClass("h-9", "rounded-full", "bg-brand/10", "font-mono", "text-brand");

    const type = screen.getByText("Premium Full Image");
    expect(type.parentElement).toHaveClass("h-9", "rounded-full", "bg-brand/10", "text-brand");

    const remove = screen.getByRole("button", { name: "Remove module" });
    expect(remove).toHaveClass("h-9", "w-9", "rounded-full", "bg-brand-red");

    expect(screen.getByRole("combobox", { name: "Module status" })).toHaveClass("h-9", "rounded-full");

    const suggestion = screen.getByRole("textbox", { name: "Edit suggestion" });
    expect(suggestion).toBeInTheDocument();
    expect(suggestion.closest("div")).toHaveClass("min-w-0", "flex-1");
    expect(screen.getByRole("button", { name: "Alt text" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Alt text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Headline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Body text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Alt text" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy Edit suggestion/i })).not.toBeInTheDocument();
  });

  it("copies headline text from the field label icon", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Aplus2ModuleEditor
          module={{ ...moduleDto, headlineText: "Crunchy natural peanut butter" }}
          versionId="ver-1"
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Headline" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Crunchy natural peanut butter")
    );
  });
});
