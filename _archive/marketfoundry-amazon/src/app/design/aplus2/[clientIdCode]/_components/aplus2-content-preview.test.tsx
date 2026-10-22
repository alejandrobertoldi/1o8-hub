import { fireEvent, render, screen } from "@testing-library/react";
import { Aplus2ContentPreview } from "./aplus2-content-preview";
import type { ModuleDto } from "../[marketplace]/[setIdentifier]/_components/aplus2-module-editor";

function carouselModule(slideCount: number): ModuleDto {
  const items = Array.from({ length: slideCount }, (_, i) => ({
    id: `item-${i + 1}`,
    position: i + 1,
    data: { type: "carousel_slide", headline: `Slide ${i + 1}` },
  }));
  return {
    id: "mod-1",
    position: 1,
    moduleType: "simple_image_carousel",
    status: "draft",
    headlineText: null,
    subheadlineText: null,
    bodyText: null,
    overlayText: null,
    altText: null,
    mobileAltText: null,
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
    items,
    assets: items.map((item) => ({
      id: `asset-${item.id}`,
      kind: "image",
      slotKey: "slide_image",
      variant: "desktop",
      driveFileId: `file-${item.id}`,
      filename: `${item.id}.png`,
      moduleId: "mod-1",
      moduleItemId: item.id,
    })),
  };
}

describe("Aplus2ContentPreview carousel chrome", () => {
  it("renders one Amazon-style dot per slide and a wider active pill", () => {
    render(<Aplus2ContentPreview modules={[carouselModule(3)]} variant="desktop" />);

    expect(screen.getByRole("tablist", { name: "3 slides" })).toBeInTheDocument();
    const dots = screen.getAllByRole("tab");
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-selected", "true");
    expect(dots[0]).toHaveClass("w-4");
    expect(dots[1]).toHaveAttribute("aria-selected", "false");
    expect(dots[1]).not.toHaveClass("w-4");
  });

  it("advances with side arrows and updates the active dot", () => {
    render(<Aplus2ContentPreview modules={[carouselModule(4)]} variant="desktop" />);

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    const dots = screen.getAllByRole("tab");
    expect(dots[1]).toHaveAttribute("aria-selected", "true");
    expect(dots[1]).toHaveClass("w-4");
    expect(screen.getByRole("tablist", { name: "4 slides" })).toBeInTheDocument();
  });
});
