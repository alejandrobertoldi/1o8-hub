"use client";
import { SlideShell, Topbar, Bottombar, Val, SlotImage, useDeck, type SlideComponent } from "./primitives";
import { slideDef } from "@/lib/case-study/kit/slides";
import { pct } from "@/lib/case-study/kit/display";
import { isMissing } from "@/lib/case-study/kit/metrics";

const Num = (n: string) => <span style={{ color: "var(--c-yellow)", fontWeight: 700 }}>{n}</span>;

const brandStoryDef = slideDef("brand_story");
const listingImagesDef = slideDef("listing_images");
const aplusDef = slideDef("aplus");
const storefrontDef = slideDef("storefront");
const img = (def: typeof brandStoryDef, id: string) => def.images.find((i) => i.id === id)!;

const BrandStory: SlideComponent = ({ content }) => {
  const { clientName } = useDeck();
  return (
    <SlideShell label="Brand Story">
      <div className="slide-frame">
        <Topbar left={<>{Num("10")} &nbsp;·&nbsp; Brand Story</>} right="Creative foundation" />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 18, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 56 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div className="eyebrow"><span className="dash" />Amazon Brand Story</div>
              <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 60, marginTop: 20 }}>Not a product. <span style={{ color: "var(--c-yellow)" }}>The brand.</span></h1>
            </div>
          </div>
          <div style={{ width: "100%", aspectRatio: "1200 / 230", marginTop: 28, position: "relative" }}>
            <SlotImage content={content} slot={img(brandStoryDef, "bs-hero")} radius={14} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          </div>
          <p className="body" style={{ maxWidth: "80ch", color: "var(--c-mute-2)", fontSize: 23, marginTop: 24 }}>
            A rich, swipeable module below A+ content on every detail page — it introduces {clientName}, cross-sells the full range, and turns first-time visitors into brand shoppers.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: "auto", paddingTop: 28 }}>
            <span className="chan sc"><i />Builds trust</span>
            <span className="chan sc"><i />Cross-sells the catalogue</span>
            <span className="chan sc"><i />Differentiates the brand</span>
            <span className="chan sc"><i />Drives product discovery</span>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const LI_BADGES: { id: string; badge: string; placeholder: string }[] = [
  { id: "li-2", badge: "02", placeholder: "Benefits" },
  { id: "li-3", badge: "03", placeholder: "Ingredients" },
  { id: "li-4", badge: "04", placeholder: "Lifestyle" },
  { id: "li-5", badge: "05", placeholder: "Comparison" },
  { id: "li-6", badge: "06", placeholder: "Ingredients" },
  { id: "li-7", badge: "07", placeholder: "How-to" },
  { id: "li-8", badge: "08", placeholder: "Trust / guarantee" },
  { id: "li-9", badge: "09", placeholder: "PT09" },
];

const ListingImages: SlideComponent = ({ content, e, d }) => {
  const heroCount = listingImagesDef.images.filter((slot) => {
    const manual = content.manualImages?.[slot.id] ?? [];
    const design = content.designImages?.[slot.id] ?? [];
    return manual.length > 0 || design.length > 0;
  }).length;
  return (
    <SlideShell label="Listing Images">
      <div className="slide-frame">
        <Topbar left={<>{Num("11")} &nbsp;·&nbsp; Listing Images</>} right="Product detail page" />
        <div style={{ marginTop: 12 }}>
          <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 60 }}>Every image <span style={{ color: "var(--c-yellow)" }}>earns the click.</span></h1>
          <p className="body" style={{ maxWidth: "72ch", color: "var(--c-mute-2)", fontSize: 22, marginTop: 12 }}>
            A full {heroCount}-image set per hero ASIN — main hero plus eight supporting frames covering benefits, ingredients, lifestyle, comparison, and how-to — the sequence behind a <Val v={pct(d.cvrPct)} missing={isMissing(e, d, "cvrPct")} /> conversion rate.
          </p>
        </div>
        <div style={{ marginTop: 24, flex: 1, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 26, minHeight: 0, alignItems: "stretch" }}>
          <div style={{ position: "relative", alignSelf: "center", width: 400, aspectRatio: "1 / 1" }}>
            <div style={{ position: "absolute", top: 14, left: 14, zIndex: 3, fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-yellow-ink)", background: "var(--c-yellow)", padding: "6px 12px", borderRadius: 7 }}>01 · Hero</div>
            <SlotImage content={content} slot={img(listingImagesDef, "li-main")} radius={16} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridAutoRows: "1fr", gap: 16, minHeight: 0, minWidth: 0 }}>
            {LI_BADGES.map((b) => (
              <div key={b.id} style={{ position: "relative", minHeight: 0, minWidth: 0 }}>
                <span style={{ position: "absolute", top: 9, left: 9, zIndex: 3, fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--c-mute-2)", background: "rgba(47,44,44,.85)", padding: "3px 8px", borderRadius: 6 }}>{b.badge}</span>
                <SlotImage content={content} slot={img(listingImagesDef, b.id)} radius={12} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
            ))}
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const APLUS_COLUMNS = [
  ["ap-1", "ap-2", "ap-3", "ap-4"],
  ["ap-b1", "ap-b2", "ap-b3", "ap-b4"],
  ["ap-c1", "ap-c2", "ap-c3", "ap-c4"],
];

const Aplus: SlideComponent = ({ content }) => {
  const modules = content.creativeCounts?.aplusPremiumModules ?? null;
  const asinsLive = content.creativeCounts?.aplusAsinsLive ?? null;
  return (
    <SlideShell label="Premium A+ Content">
      <div className="slide-frame">
        <Topbar left={<>{Num("12")} &nbsp;·&nbsp; Premium A+ Content</>} right="Brand-controlled detail page" />
        <div style={{ display: "grid", gridTemplateColumns: "0.62fr 2.38fr", gap: 32, flex: 1, marginTop: 16, minHeight: 0, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="eyebrow"><span className="dash" />Enhanced detail page</div>
            <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 64, marginTop: 24 }}>Premium<br />A+ modules.</h1>
            <p className="body" style={{ maxWidth: "34ch", color: "var(--c-mute-2)", fontSize: 23, marginTop: 22 }}>
              Amazon&apos;s richest detail-page format — larger visuals, interactive hotspots, comparison charts and video. It educates shoppers, sets accurate expectations to reduce returns, and lifts conversion.
            </p>
            <div style={{ display: "flex", gap: 40, marginTop: 34 }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 52, color: "var(--c-white)", lineHeight: 1 }}>
                  <Val v={String(modules ?? "—")} missing={modules == null} />
                </div>
                <div className="kpi-hint" style={{ marginTop: 6 }}>Premium modules</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 52, color: "var(--c-white)", lineHeight: 1 }}>
                  <Val v={String(asinsLive ?? "—")} missing={asinsLive == null} />
                </div>
                <div className="kpi-hint" style={{ marginTop: 6 }}>ASINs live</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", height: "100%", minWidth: 0 }}>
            {APLUS_COLUMNS.map((col, ci) => (
              <div key={ci} style={{ flex: "1 1 0", minWidth: 0, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", gap: 0 }}>
                {col.map((id) => (
                  <div key={id} style={{ position: "relative", width: "100%", aspectRatio: "1200 / 492" }}>
                    <SlotImage content={content} slot={img(aplusDef, id)} radius={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const Storefront: SlideComponent = ({ content }) => {
  return (
    <SlideShell label="Storefront">
      <div className="slide-frame" style={{ padding: "64px var(--pad-x) 92px" }}>
        <Topbar left={<>{Num("13")} &nbsp;·&nbsp; Storefront</>} right="The brand's home on Amazon" />
        <div style={{ display: "grid", gridTemplateColumns: "0.62fr 2.38fr", gap: 32, flex: 1, marginTop: 16, minHeight: 0, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="eyebrow"><span className="dash" />Multi-page store</div>
            <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 64, marginTop: 24 }}>One<br />destination,<br /><span style={{ color: "var(--c-yellow)" }}>whole brand.</span></h1>
            <p className="body" style={{ maxWidth: "34ch", color: "var(--c-mute-2)", fontSize: 23, marginTop: 22 }}>
              A customizable, multi-page brand destination — the landing page for Sponsored Brands, Posts and external traffic, built to showcase the full catalogue and guide shoppers through curated, cross-sell-ready collections.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "flex-start", height: "100%", minWidth: 0 }}>
            {["sf-a1", "sf-b1", "sf-c1"].map((id) => (
              <div key={id} style={{ flex: "1 1 0", minWidth: 0, aspectRatio: "3000 / 6500", maxHeight: "100%", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "3000 / 6500" }}>
                  <SlotImage content={content} slot={img(storefrontDef, id)} radius={0} style={{ width: "100%", height: "100%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

export const DETAILED_C = { brand_story: BrandStory, listing_images: ListingImages, aplus: Aplus, storefront: Storefront };
