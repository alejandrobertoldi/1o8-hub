"use client";
import { SlideShell, Topbar, Bottombar, Copy, Val, Metric, PageNo, SlotImage, useDeck, type SlideComponent } from "./primitives";
import { slideDef, type DetailedSlideType } from "@/lib/case-study/kit/slides";
import { usd, mult, pct, count, splitMetric } from "@/lib/case-study/kit/display";
import { isMissing } from "@/lib/case-study/kit/metrics";

const Y = { color: "var(--c-yellow)" } as const;
const Num = (n: string) => <span style={{ color: "var(--c-yellow)", fontWeight: 700 }}>{n}</span>;

const coverDef = slideDef("cover");
const img = (id: string) => coverDef.images.find((i) => i.id === id)!;

const Cover: SlideComponent = ({ content }) => {
  const { clientName, period, editing } = useDeck();
  const hasQuote = !!content.copy.quote?.trim();
  return (
    <SlideShell label="Cover">
      <div className="slide-frame" style={{ padding: "48px var(--pad-x) 44px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mf-logo" src="/case-study/mf-logo.png" alt="market foundry" />
          <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 24, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--c-mute-2)" }}>
            <div>Amazon Seller Central Case Study</div>
            <div style={{ marginTop: 10, opacity: .55 }}>{period}</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 80, alignItems: "center", marginTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
            <div className="eyebrow" style={{ fontSize: 26 }}><span className="dash" /><span><Copy content={content} k="positioning" /></span></div>
            <h1 className="display" style={{ fontSize: 158, lineHeight: .84, color: "var(--c-white)", margin: 0 }}>
              <Copy content={content} k="claim" />
              <span className="yellow-dot" style={{ background: "var(--c-white)", width: ".12em", height: ".12em", marginLeft: ".02em", verticalAlign: ".18em" }} />
            </h1>
            <p className="body lg" style={{ maxWidth: "30ch", color: "var(--c-mute-2)", fontSize: 30, lineHeight: 1.4 }}>
              How <strong style={{ color: "var(--c-white)" }}>{clientName}</strong> <Copy content={content} k="didWhat" /> — <Copy content={content} k="summary" />.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, justifySelf: "end", width: "100%", maxWidth: 560, alignSelf: "stretch" }}>
            <div style={{ width: "100%", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
              <SlotImage content={content} slot={img("cover-hero")} radius={18} style={{ width: "100%", height: "100%" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ width: 170, height: 96, flexShrink: 0, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
                <SlotImage content={content} slot={img("cover-logo")} radius={8} style={{ width: "100%", height: "100%" }} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--c-mute)", marginBottom: 10 }}>Client</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1, color: "var(--c-white)", textTransform: "uppercase", letterSpacing: "-.015em" }}>{clientName}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 24, color: "var(--c-mute-2)", marginTop: 10 }}><Copy content={content} k="category" /></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--c-mute-2)" }}>Amazon · Seller Central</div>
          {(hasQuote || editing) && (
            <div style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 23, color: "var(--c-mute-2)", textAlign: "right", whiteSpace: "nowrap" }}>
              “<Copy content={content} k="quote" />”
            </div>
          )}
        </div>
      </div>
    </SlideShell>
  );
};

const Brief: SlideComponent = ({ content }) => {
  const { clientName } = useDeck();
  return (
    <SlideShell label="The Brief">
      <div className="slide-frame">
        <Topbar left={<>{Num("02")} · The Brief</>} right={clientName} />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 80, alignItems: "center", marginTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <h1 className="title-xl" style={{ color: "var(--c-white)", lineHeight: 1.04, fontSize: 92 }}>
              <span style={{ display: "block" }}><Copy content={content} k="line1" /></span>
              <span style={{ display: "block" }}><span style={{ color: "var(--c-mute-2)" }}><Copy content={content} k="line2" /></span> <span style={Y}><Copy content={content} k="line2Accent" /></span></span>
              <span style={{ display: "block" }}><Copy content={content} k="line3" /></span>
            </h1>
            <p className="body" style={{ maxWidth: "33ch", color: "var(--c-mute-2)", fontSize: 26 }}>
              <Copy content={content} k="situation" />
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
            <div className="kpi" style={{ flexDirection: "row", alignItems: "center", gap: 32, padding: "26px 34px" }}>
              <div className="chan sc" style={{ fontSize: 24, padding: "12px 18px" }}><i />▸</div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 30, textTransform: "uppercase", lineHeight: 1, letterSpacing: "-.015em" }}>The starting point</div>
                <div className="kpi-hint" style={{ marginTop: 8 }}><Copy content={content} k="startingPoint" /></div>
              </div>
            </div>
            <div className="kpi" style={{ flexDirection: "row", alignItems: "center", gap: 32, padding: "26px 34px" }}>
              <div className="chan sc" style={{ fontSize: 24, padding: "12px 18px" }}><i />▸</div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 30, textTransform: "uppercase", lineHeight: 1, letterSpacing: "-.015em" }}>The mandate</div>
                <div className="kpi-hint" style={{ marginTop: 8 }}><Copy content={content} k="deliverables" /></div>
              </div>
            </div>
            <div className="kpi" style={{ flexDirection: "row", alignItems: "center", gap: 32, padding: "26px 34px" }}>
              <div className="metric" style={{ fontSize: 56, minWidth: 120, textAlign: "center", color: "var(--c-yellow)" }}>
                <Copy content={content} k="targetValue" />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 30, textTransform: "uppercase", lineHeight: 1, letterSpacing: "-.015em" }}>The goal</div>
                <div className="kpi-hint" style={{ marginTop: 8 }}><Copy content={content} k="targetLabel" /></div>
              </div>
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
  const kpi4HintEmpty = !content.copy.kpi4Hint?.trim();
  return (
    <SlideShell label="Results at a Glance">
      <div className="slide-frame" style={{ paddingBottom: 130 }}>
        <Topbar left={<>{Num("03")} · Results</>} right={<Copy content={content} k="scope" />} />
        <div style={{ marginTop: 16, display: "flex", alignItems: "end", justifyContent: "space-between", gap: 48 }}>
          <h1 className="title-xl" style={{ color: "var(--c-white)", maxWidth: "18ch", fontSize: 84 }}>
            <Copy content={content} k="headline" /><br /><span style={Y}>six</span> proof points.
          </h1>
          <p className="body" style={{ maxWidth: "32ch", color: "var(--c-mute-2)", fontSize: 24 }}>
            Seller Central and Sponsored Ads reporting · {period}.
          </p>
        </div>
        <div style={{ marginTop: 28, flex: 1, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "1fr 1fr", gap: 22 }}>
          <div className="kpi accent" style={{ padding: "32px 36px" }}>
            <Metric value={usd(e.salesTotal, "detailed")} unitClass="pct" style={{ fontSize: 104 }} />
            <div>
              <div className="metric-label" style={{ marginTop: 8 }}><Copy content={content} k="kpi1Label" /></div>
              <div className="kpi-hint" style={{ marginTop: 6 }}><Copy content={content} k="kpi1Hint" /></div>
            </div>
          </div>
          <div className="kpi" style={{ padding: "32px 36px" }}>
            <Metric value={mult(d.growthMultiple)} unitClass="pct" style={{ fontSize: 104 }} />
            <div>
              <div className="metric-label" style={{ marginTop: 8 }}><Copy content={content} k="kpi2Label" /></div>
              <div className="kpi-hint" style={{ marginTop: 6 }}><span className="kpi-up"><Copy content={content} k="kpi2Hint" /></span></div>
            </div>
          </div>
          <div className="kpi" style={{ padding: "32px 36px" }}>
            <Metric value={count(e.adImpressions)} unitClass="unit" style={{ fontSize: 104 }} />
            <div>
              <div className="metric-label" style={{ marginTop: 8 }}><Copy content={content} k="kpi3Label" /></div>
              <div className="kpi-hint" style={{ marginTop: 6 }}><Copy content={content} k="kpi3Hint" /></div>
            </div>
          </div>
          <div className="kpi" style={{ padding: "32px 36px" }}>
            <Metric value={usd(e.adSales, "detailed")} unitClass="unit" style={{ fontSize: 104 }} />
            <div>
              <div className="metric-label" style={{ marginTop: 8 }}><Copy content={content} k="kpi4Label" /></div>
              <div className="kpi-hint" style={{ marginTop: 6 }}>
                {kpi4HintEmpty ? `${mult(d.roas)} ROAS` : <Copy content={content} k="kpi4Hint" />}
              </div>
            </div>
          </div>
          <div className="kpi" style={{ padding: "32px 36px" }}>
            <Metric value={pct(e.buyBoxPct, 0)} unitClass="pct" style={{ fontSize: 104 }} />
            <div>
              <div className="metric-label" style={{ marginTop: 8 }}><Copy content={content} k="kpi5Label" /></div>
              <div className="kpi-hint" style={{ marginTop: 6 }}><Copy content={content} k="kpi5Hint" /></div>
            </div>
          </div>
          <div className="kpi" style={{ padding: "32px 36px" }}>
            <Metric value={pct(d.cvrPct)} unitClass="pct" style={{ fontSize: 104 }} />
            <div>
              <div className="metric-label" style={{ marginTop: 8 }}><Copy content={content} k="kpi6Label" /></div>
              <div className="kpi-hint" style={{ marginTop: 6 }}><Copy content={content} k="kpi6Hint" /></div>
            </div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const Snapshot: SlideComponent = ({ content, e, d }) => {
  const { clientName, period } = useDeck();
  const aspText = d.asp != null && Number.isFinite(d.asp) ? `$${d.asp.toFixed(2)}` : "—";
  const { num: headlineNum, unit: headlineUnit } = splitMetric(usd(e.salesTotal, "detailed"));
  return (
    <SlideShell label="Seller Central Snapshot">
      <div className="slide-frame">
        <Topbar left={<>{Num("04")} · Seller Central Snapshot</>} right={<>{clientName} · {period}</>} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "end", justifyContent: "space-between", gap: 48 }}>
          <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 80 }}>One storefront, <span style={Y}>every lever.</span></h1>
          <p className="body" style={{ maxWidth: "34ch", color: "var(--c-mute-2)", fontSize: 24 }}><Copy content={content} k="body" /></p>
        </div>
        <div style={{ marginTop: 30, flex: 1, display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 28 }}>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 22, padding: "34px 38px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="chan sc"><i />Seller Central</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--c-mute)" }}>{period}</div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 104, lineHeight: .9, color: "var(--c-white)", letterSpacing: "-.03em" }}>
                <Val v={headlineNum} missing={isMissing(e, d, "salesTotal")} />
                {headlineUnit && <span style={{ color: "var(--c-yellow)", fontSize: ".5em" }}>{headlineUnit}</span>}
              </div>
              <div className="kpi-hint">
                <Copy content={content} k="headlineLabel" /><br />
                <span style={{ color: "var(--c-mute)" }}><Copy content={content} k="headlineContext" /></span>
              </div>
            </div>
            <div style={{ height: 1, background: "var(--c-line)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 15, fontSize: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>Units sold</span>
                <span><strong style={{ color: "var(--c-white)" }}><Val v={count(e.unitsTotal)} missing={isMissing(e, d, "unitsTotal")} /></strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>Avg. unit price</span>
                <span><strong style={{ color: "var(--c-white)" }}><Val v={aspText} missing={isMissing(e, d, "asp")} /></strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>Active ASINs</span>
                <span style={{ whiteSpace: "nowrap" }}><strong style={{ color: "var(--c-white)" }}><Val v={count(e.skuCount)} missing={isMissing(e, d, "skuCount")} /></strong> SKUs</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>Page views</span>
                <span style={{ whiteSpace: "nowrap" }}><strong style={{ color: "var(--c-white)" }}><Val v={count(e.pageViews)} missing={isMissing(e, d, "pageViews")} /></strong></span>
              </div>
              {e.fulfilment && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span className="muted" style={{ whiteSpace: "nowrap" }}>Fulfilment</span>
                  <span>{e.fulfilment}</span>
                </div>
              )}
            </div>
            <div style={{ marginTop: "auto", background: "rgba(247,191,29,.08)", border: "1px solid rgba(247,191,29,.25)", borderRadius: 12, padding: "18px 22px", fontSize: 23, color: "var(--c-mute-2)" }}>
              The <strong style={Y}>whole business runs here.</strong> <Copy content={content} k="engineLine" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 20 }}>
            <div className="kpi" style={{ padding: "28px 32px" }}>
              <Metric value={count(e.sessions)} unitClass="unit" style={{ fontSize: 80 }} />
              <div>
                <div className="metric-label" style={{ marginTop: 8 }}>Sessions</div>
                <div className="kpi-hint" style={{ marginTop: 6 }}>{period}</div>
              </div>
            </div>
            <div className="kpi" style={{ padding: "28px 32px" }}>
              <Metric value={pct(d.cvrPct)} unitClass="pct" style={{ fontSize: 80 }} />
              <div>
                <div className="metric-label" style={{ marginTop: 8 }}>Conversion</div>
                <div className="kpi-hint" style={{ marginTop: 6 }}>Unit session rate</div>
              </div>
            </div>
            <div className="kpi" style={{ padding: "28px 32px" }}>
              <Metric value={pct(e.buyBoxPct, 0)} unitClass="pct" style={{ fontSize: 80 }} />
              <div>
                <div className="metric-label" style={{ marginTop: 8 }}>Buy Box</div>
                <div className="kpi-hint" style={{ marginTop: 6 }}>Featured-offer share</div>
              </div>
            </div>
            <div className="kpi accent" style={{ padding: "28px 32px" }}>
              <Metric value={mult(d.roas)} unitClass="unit" style={{ fontSize: 80 }} />
              <div>
                <div className="metric-label" style={{ marginTop: 8 }}>Blended ROAS</div>
                <div className="kpi-hint" style={{ marginTop: 6 }}>Across all Sponsored Ads</div>
              </div>
            </div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const Approach: SlideComponent = ({ content }) => {
  return (
    <SlideShell label="Our Approach" className="light">
      <div className="slide-frame">
        <Topbar left={<>{Num("05")} · Our Approach</>} right="5 pillars · Seller Central" />
        <div style={{ marginTop: 18, maxWidth: "60ch" }}>
          <h1 className="title-xl" style={{ color: "var(--c-ink)", fontSize: 84 }}>
            One playbook,<br />built for <span style={{ color: "#D2570F" }}>Seller Central.</span>
          </h1>
          <p className="body" style={{ maxWidth: "46ch", color: "var(--c-mute)", fontSize: 26, marginTop: 24 }}>
            <Copy content={content} k="body" />
          </p>
        </div>
        <div style={{ marginTop: 40, flex: 1, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 28, alignItems: "stretch" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div className="pillar" key={n}>
              <div className="num">{String(n).padStart(2, "0")}</div>
              <div className="h" style={{ color: "var(--c-ink)" }}><Copy content={content} k={`pillar${n}`} /></div>
              <div className="desc"><Copy content={content} k={`pillar${n}Desc`} /></div>
            </div>
          ))}
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const NextSteps: SlideComponent = () => {
  const { contactEmail } = useDeck();
  return (
    <SlideShell label="Next Steps" className="yellow">
      <div className="slide-frame">
        <Topbar left="14 · Next Steps" right={contactEmail} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 48, paddingBottom: 20 }}>
          <h1 className="display" style={{ fontSize: 176, lineHeight: .88, color: "var(--c-yellow-ink)", margin: 0, maxWidth: "20ch" }}>
            Let{"'"}s do<br />something<br />original.
            <span className="yellow-dot" style={{ background: "var(--c-yellow-ink)", width: ".15em", height: ".15em", verticalAlign: ".5em", marginLeft: ".04em" }} />
          </h1>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 64, alignItems: "end" }}>
            <p className="body" style={{ maxWidth: "36ch", color: "var(--c-yellow-ink)", fontSize: 30, lineHeight: 1.4 }}>
              We work with CPG brands to win the shopping cart <span style={{ fontStyle: "italic" }}>@</span> retail<span style={{ opacity: .4 }}> · </span>amazon<span style={{ opacity: .4 }}> · </span>shopify.<br />
              <span style={{ opacity: .7 }}>Bring us your hardest growth problem.</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, justifySelf: "end", alignItems: "flex-end", textAlign: "right" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="mf-logo on-accent" src="/case-study/mf-logo.png" style={{ height: 168, marginBottom: 14 }} alt="market foundry" />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--c-yellow-ink)", opacity: .65 }}>Get in touch</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 44, color: "var(--c-yellow-ink)", textTransform: "uppercase", letterSpacing: "-.015em" }}>{contactEmail}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 24, color: "var(--c-yellow-ink)", opacity: .75 }}>market·foundry</div>
            </div>
          </div>
        </div>
        <div className="bottombar" style={{ color: "var(--c-yellow-ink)", opacity: .7 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mf-mark on-accent" src="/case-study/mf-mark.png" alt="market foundry" />
          <span><PageNo /></span>
        </div>
      </div>
    </SlideShell>
  );
};

export const DETAILED_A: Pick<Record<DetailedSlideType, SlideComponent>, "cover" | "brief" | "results" | "snapshot" | "approach" | "next_steps"> = {
  cover: Cover, brief: Brief, results: Results, snapshot: Snapshot, approach: Approach, next_steps: NextSteps,
};
