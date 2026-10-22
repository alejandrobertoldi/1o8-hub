import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Aplus2RepeatableItems } from "./aplus2-repeatable-items";
import { APLUS2_MODULE_SPECS } from "@/lib/aplus2/module-specs";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ORIGINAL_ALT =
  "Fresh Vintage Farms cold-pressed almond oil bottle displayed on wooden counter";

function slide(id: string, position: number, altText = ORIGINAL_ALT) {
  return {
    id,
    position,
    data: {
      type: "carousel_slide",
      headline: "",
      body: "",
      cta_text: "",
      asin: "",
      altText,
      mobileAltText: altText,
    },
  };
}

function renderCarousel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Aplus2RepeatableItems
        spec={APLUS2_MODULE_SPECS.simple_image_carousel}
        items={[slide("item-1", 1), slide("item-2", 2)]}
        assets={[]}
        versionId="ver-1"
        moduleId="mod-1"
      />
    </QueryClientProvider>,
  );
}

describe("Aplus2RepeatableItems carousel alt text", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
  });

  it("keeps typed characters instead of snapping back to the previous value", () => {
    renderCarousel();
    const input = screen.getAllByDisplayValue(ORIGINAL_ALT)[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: `${ORIGINAL_ALT} extra` } });
    expect(input.value).toBe(`${ORIGINAL_ALT} extra`);
  });

  it("saves mirrored desktop and mobile alt text once on blur, not on each keystroke", async () => {
    renderCarousel();
    const input = screen.getAllByDisplayValue(ORIGINAL_ALT)[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "new alt" } });
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.blur(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      data: expect.objectContaining({
        type: "carousel_slide",
        altText: "new alt",
        mobileAltText: "new alt",
      }),
    });
  });

  it("puts copy icons on panel text fields and alt, not the edit suggestion", () => {
    renderCarousel();
    expect(screen.getAllByRole("button", { name: "Copy Headline" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy Body Text" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy Button Text" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy ASIN" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy Alt text" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Copy Edit suggestion/i })).not.toBeInTheDocument();
  });
});
