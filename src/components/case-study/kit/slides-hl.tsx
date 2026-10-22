"use client";
import { SlideShell, Topbar, Bottombar, Copy, Val, Metric, PageNo, SlotImage, useDeck, type SlideComponent } from "./primitives";
import { slideDef, resolveSlotImages, type HlSlideType } from "@/lib/case-study/kit/slides";
import { usd, mult, pct, count } from "@/lib/case-study/kit/display";
import { isMissing } from "@/lib/case-study/kit/metrics";

const Y = { color: "var(--c-yellow)" } as const;
const TopLabel = ({ text }: { text: string }) => <><span style={{ color: "var(--c-yellow)", fontWeight: 700 }}>■</span>{"  "}{text}</>;

const img = (type: HlSlideType, id: string) => {
  const def = slideDef(type);
  return def.images.find((i) => i.id === id)!;
};

const LI_IDS = ["li1", "li2", "li3", "li4", "li5", "li6", "li7", "li8", "li9"];

const Cover: SlideComponent = ({ content, e, d }) => {
  const { clientName, period } = useDeck();
  return (
    <SlideShell label="Cover">
      <div className="slide-frame" style={{ padding: "48px var(--pad-x) 44px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mf-logo" src="/case-study/mf-logo.png" alt="market foundry" />
          <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 24, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--c-mute-2)" }}>
            <div>Amazon Case Study · High-Level</div>
            <div style={{ marginTop: 10, opacity: .55 }}>{period}</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 80, alignItems: "center", marginTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <h1 className="title-xl" style={{ fontSize: 120 }}>
              <Copy content={content} k="claim" /><br /><span style={Y}><Copy content={content} k="result" /></span>
            </h1>
            <p className="body lg" style={{ maxWidth: "42ch", color: "var(--c-mute-2)" }}><Copy content={content} k="summary" /></p>
            <div style={{ display: "flex", gap: 20 }}>
              <div className="card" style={{ padding: "24px 32px" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 52, lineHeight: 1, color: "var(--c-white)" }}>
                  <Val v={usd(e.salesTotal, "high_level")} missing={isMissing(e, d, "salesTotal")} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 19, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--c-mute)", marginTop: 10 }}>
                  <Copy content={content} k="kpi1Label" />
                </div>
              </div>
              <div className="card" style={{ padding: "24px 32px" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 52, lineHeight: 1, color: "var(--c-yellow)" }}>
                  <Val v={mult(d.growthMultiple)} missing={isMissing(e, d, "growthMultiple")} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 19, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--c-mute)", marginTop: 10 }}>
                  <Copy content={content} k="kpi2Label" />
                </div>
              </div>
              <div className="card" style={{ padding: "24px 32px" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 52, lineHeight: 1, color: "var(--c-white)" }}>
                  <Val v={usd(e.adSales, "high_level")} missing={isMissing(e, d, "adSales")} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 19, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--c-mute)", marginTop: 10 }}>
                  <Copy content={content} k="kpi3Label" />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, justifySelf: "end", width: "100%", maxWidth: 520, alignSelf: "stretch", padding: "24px 0" }}>
            <div style={{ width: "100%", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SlotImage content={content} slot={img("hl_cover", "cover-hero")} radius={18} style={{ width: "100%", height: "100%" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ width: 150, height: 84, flexShrink: 0, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SlotImage content={content} slot={img("hl_cover", "cover-logo")} radius={8} style={{ width: "100%", height: "100%" }} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--c-mute)", marginBottom: 8 }}>Client</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, lineHeight: 1, color: "var(--c-white)", textTransform: "uppercase" }}>{clientName}</div>
                <div style={{ fontSize: 22, color: "var(--c-mute-2)", marginTop: 8 }}><Copy content={content} k="category" /></div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--c-mute-2)" }}>
            Amazon · Seller Central · <Copy content={content} k="engagement" />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".18em", color: "var(--c-mute)" }}><PageNo /></div>
        </div>
      </div>
    </SlideShell>
  );
};

const Challenge: SlideComponent = ({ content, e, d }) => {
  const { clientName } = useDeck();
  return (
    <SlideShell label="The Challenge">
      <div className="slide-frame">
        <Topbar left={<TopLabel text="The Challenge" />} right={clientName} />
        <div style={{ display: "flex", flexDirection: "column", gap: 36, marginTop: 60, flex: 1, justifyContent: "center" }}>
          <h1 className="title-lg" style={{ fontSize: 84, maxWidth: "26ch" }}>
            <Copy content={content} k="headline" /><br /><span style={Y}><Copy content={content} k="headlineAccent" /></span>
          </h1>
          <p className="body lg" style={{ maxWidth: "62ch", color: "var(--c-mute-2)" }}><Copy content={content} k="body" /></p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 12 }}>
            <div className="card" style={{ padding: "40px 44px" }}>
              <div className="chan sc" style={{ marginBottom: 24 }}><i />The starting point</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 56, lineHeight: 1, color: "var(--c-white)" }}>
                <Val v={usd(d.startSales, "high_level")} missing={isMissing(e, d, "startSales")} />
              </div>
              <div style={{ fontSize: 24, color: "var(--c-mute-2)", marginTop: 14 }}><Copy content={content} k="startLabel" /></div>
            </div>
            <div className="card" style={{ padding: "40px 44px", borderColor: "rgba(247,191,29,.35)" }}>
              <div className="chan sc" style={{ marginBottom: 24 }}><i />The target</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 56, lineHeight: 1, color: "var(--c-yellow)" }}>
                <Copy content={content} k="targetValue" />
              </div>
              <div style={{ fontSize: 24, color: "var(--c-mute-2)", marginTop: 14 }}><Copy content={content} k="targetLabel" /></div>
            </div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const Results: SlideComponent = ({ content, e, d }) => {
  const { period } = useDeck();
  return (
    <SlideShell label="The Results">
      <div className="slide-frame">
        <Topbar left={<TopLabel text="The Results" />} right={<>Seller Central · {period}</>} />
        <h1 className="title-lg" style={{ fontSize: 76, marginTop: 70 }}>
          <Copy content={content} k="headline" /> <span style={Y}>six proof points.</span>
        </h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridAutoRows: "1fr", gap: 24, flex: 1, marginTop: 40, marginBottom: 20 }}>
          <div className="kpi accent">
            <Metric value={usd(e.salesTotal, "high_level")} unitClass="pct" unitStyle={{ color: "var(--c-yellow-ink)" }} style={{ fontSize: 96 }} />
            <div className="metric-label"><Copy content={content} k="kpi1Label" /></div>
          </div>
          <div className="kpi">
            <Metric value={mult(d.growthMultiple)} unitClass="pct" style={{ fontSize: 96 }} />
            <div className="metric-label"><Copy content={content} k="kpi2Label" /></div>
          </div>
          <div className="kpi">
            <Metric value={count(e.adImpressions)} unitClass="unit" style={{ fontSize: 96 }} />
            <div className="metric-label"><Copy content={content} k="kpi3Label" /></div>
          </div>
          <div className="kpi">
            <Metric value={usd(e.adSales, "high_level")} unitClass="unit" style={{ fontSize: 96 }} />
            <div className="metric-label"><Copy content={content} k="kpi4Label" /> · {mult(d.roas)} ROAS</div>
          </div>
          <div className="kpi">
            <Metric value={pct(e.buyBoxPct, 0)} unitClass="pct" style={{ fontSize: 96 }} />
            <div className="metric-label"><Copy content={content} k="kpi5Label" /></div>
          </div>
          <div className="kpi">
            <Metric value={pct(d.cvrPct)} unitClass="pct" style={{ fontSize: 96 }} />
            <div className="metric-label"><Copy content={content} k="kpi6Label" /></div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const Approach: SlideComponent = ({ content }) => (
  <SlideShell label="The Approach">
    <div className="slide-frame">
      <Topbar left={<TopLabel text="The Approach" />} right="One playbook · launch year" />
      <div style={{ marginTop: 80 }}>
        <h1 className="title-lg" style={{ fontSize: 76 }}>
          <Copy content={content} k="headline" /> <span style={Y}><Copy content={content} k="headlineAccent" /></span>
        </h1>
        <p className="body lg" style={{ maxWidth: "60ch", color: "var(--c-mute-2)", marginTop: 28 }}><Copy content={content} k="body" /></p>
      </div>
      <div style={{ display: "flex", gap: 32, flex: 1, alignItems: "stretch", marginTop: 44, marginBottom: 30 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div className="pillar" key={n}>
            <div className="num">{String(n).padStart(2, "0")}</div>
            <div className="h"><Copy content={content} k={`pillar${n}`} /></div>
            <div className="desc"><Copy content={content} k={`pillar${n}Desc`} /></div>
          </div>
        ))}
      </div>
      <Bottombar />
    </div>
  </SlideShell>
);

const Creative: SlideComponent = ({ content, e, d }) => {
  const { contactEmail } = useDeck();
  const heroCount = LI_IDS.filter((id) => resolveSlotImages(content, id).urls.length > 0).length;
  return (
    <SlideShell label="The Creative">
      <div className="slide-frame" style={{ paddingBottom: 0 }}>
        <Topbar left={<TopLabel text="The Creative" />} right="Amazon design system" />
        <h1 className="title-lg" style={{ fontSize: 64, marginTop: 64 }}>Not a product. <span style={Y}>The brand.</span></h1>
        <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr 1fr", gap: 40, flex: 1, marginTop: 30, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, letterSpacing: ".12em", color: "var(--c-yellow)" }}>01</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, textTransform: "uppercase", letterSpacing: ".02em" }}>Brand Story</span>
            </div>
            <div style={{ fontSize: 19, color: "var(--c-mute-2)" }}>Swipeable module below A+ — <Copy content={content} k="bsJob" /></div>
            <div style={{ width: "100%", aspectRatio: "1200 / 240", position: "relative", marginTop: 4 }}>
              <SlotImage content={content} slot={img("hl_creative", "bs")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 18 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, letterSpacing: ".12em", color: "var(--c-yellow)" }}>02</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, textTransform: "uppercase", letterSpacing: ".02em" }}>Listing Images</span>
            </div>
            <div style={{ fontSize: 19, color: "var(--c-mute-2)" }}>{heroCount}-image sets per hero ASIN — behind a {pct(d.cvrPct)} conversion rate</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginTop: 4, alignContent: "start" }}>
              {LI_IDS.map((id, i) => (
                <div style={{ position: "relative", aspectRatio: "1 / 1", minWidth: 0 }} key={id}>
                  {i === 0 && (
                    <span style={{ position: "absolute", top: 6, left: 6, zIndex: 3, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--c-yellow-ink)", background: "var(--c-yellow)", padding: "2px 8px", borderRadius: 5 }}>HERO</span>
                  )}
                  <SlotImage content={content} slot={img("hl_creative", id)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, letterSpacing: ".12em", color: "var(--c-yellow)" }}>03</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, textTransform: "uppercase", letterSpacing: ".02em" }}>Premium A+</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1200 / 492" }}>
                <SlotImage content={content} slot={img("hl_creative", "ap1")} radius={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1200 / 492" }}>
                <SlotImage content={content} slot={img("hl_creative", "ap2")} radius={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1200 / 492" }}>
                <SlotImage content={content} slot={img("hl_creative", "ap3")} radius={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
              <div style={{ position: "relative", width: "100%", flex: 1, minHeight: 0 }}>
                <SlotImage content={content} slot={img("hl_creative", "ap4")} radius={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
            </div>
            <div style={{ fontSize: 19, color: "var(--c-mute-2)" }}>
              <strong style={Y}><Val v={String(content.creativeCounts?.aplusPremiumModules ?? "—")} missing={content.creativeCounts?.aplusPremiumModules == null} /></strong> Premium modules · <Val v={String(content.creativeCounts?.aplusAsinsLive ?? "—")} missing={content.creativeCounts?.aplusAsinsLive == null} /> ASINs live
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, letterSpacing: ".12em", color: "var(--c-yellow)" }}>04</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, textTransform: "uppercase", letterSpacing: ".02em" }}>Storefront</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative", borderRadius: 10, overflow: "hidden" }}>
              <SlotImage content={content} slot={img("hl_creative", "sf")} radius={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            </div>
            <div style={{ fontSize: 19, color: "var(--c-mute-2)" }}>Multi-page destination · <strong style={Y}>{pct(e.buyBoxPct, 0)}</strong> Buy Box</div>
          </div>
        </div>
        <div style={{ margin: "26px calc(-1 * var(--pad-x)) 0", background: "var(--c-yellow)", color: "var(--c-yellow-ink)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px var(--pad-x)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mf-mark" src="/case-study/mf-mark.png" alt="market foundry" style={{ filter: "brightness(0)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 38, textTransform: "uppercase", letterSpacing: "-.01em" }}>Every image earns the click.</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 23, fontWeight: 600, letterSpacing: ".06em" }}>{contactEmail}{" · "}<PageNo /></div>
        </div>
      </div>
    </SlideShell>
  );
};

export const HL_RENDERERS: Record<HlSlideType, SlideComponent> = {
  hl_cover: Cover, hl_challenge: Challenge, hl_results: Results, hl_approach: Approach, hl_creative: Creative,
};
