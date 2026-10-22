"use client";
import { SlideShell, Topbar, Bottombar, Copy, Val, MissingChip, useDeck, type SlideComponent } from "./primitives";
import { SalesBars, CumulativeCurve, SpendSalesLines, MonthTicks } from "./charts";
import { usd, mult, pct, count, splitMetric, monthShort } from "@/lib/case-study/kit/display";
import { isMissing } from "@/lib/case-study/kit/metrics";
import type { ChannelBlock } from "@/lib/case-study/kit/metrics";

const Y = { color: "var(--c-yellow)" } as const;
const Num = (n: string) => <span style={{ color: "var(--c-yellow)", fontWeight: 700 }}>{n}</span>;
const truncTitle = (s: string) => (s.length > 42 ? `${s.slice(0, 42)}…` : s);

function KpiFig({ value, missing }: { value: string; missing?: boolean }) {
  const { num, unit } = splitMetric(value);
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 54, lineHeight: 1, color: "var(--c-white)", letterSpacing: "-.03em" }}>
      <Val v={num} missing={missing} />
      {unit && <span style={{ color: "var(--c-yellow)", fontSize: ".55em" }}>{unit}</span>}
    </div>
  );
}

const SalesGrowth: SlideComponent = ({ content, e, d }) => {
  const { period } = useDeck();
  const aspVal = d.asp != null && Number.isFinite(d.asp) ? `$${d.asp.toFixed(2)}` : null;
  const aspNum = aspVal ? aspVal.slice(0, aspVal.indexOf(".")) : "—";
  const aspDec = aspVal ? aspVal.slice(aspVal.indexOf(".")) : "";
  return (
    <SlideShell label="Sales Performance">
      <div className="slide-frame">
        <Topbar left={<>{Num("06")} &nbsp;·&nbsp; Sales Performance</>} right={<Copy content={content} k="topRight" />} />
        <div style={{ display: "grid", gridTemplateColumns: ".92fr 1.3fr", gap: 64, marginTop: 36, flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 80 }}>
              <span style={Y}><Val v={usd(e.salesTotal, "detailed")} missing={isMissing(e, d, "salesTotal")} /></span><br />on Seller<br />Central.
            </h1>
            <p className="body" style={{ maxWidth: "32ch", color: "var(--c-mute-2)", fontSize: 25 }}>
              <Copy content={content} k="body" />
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 4 }}>
              <div>
                <KpiFig value={usd(d.organicSales, "detailed")} missing={isMissing(e, d, "organicSales")} />
                <div className="kpi-hint" style={{ marginTop: 8 }}>Organic · <Val v={pct(d.organicPct, 0)} missing={isMissing(e, d, "organicPct")} /></div>
              </div>
              <div>
                <KpiFig value={usd(e.adSales, "detailed")} missing={isMissing(e, d, "adSales")} />
                <div className="kpi-hint" style={{ marginTop: 8 }}>Ad-attributed · <Val v={pct(d.adPct, 0)} missing={isMissing(e, d, "adPct")} /></div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 54, lineHeight: 1, color: "var(--c-white)", letterSpacing: "-.03em" }}>
                  <Val v={aspNum} missing={d.asp == null} />
                  {aspDec && <span style={{ color: "var(--c-yellow)", fontSize: ".55em" }}>{aspDec}</span>}
                </div>
                <div className="kpi-hint" style={{ marginTop: 8 }}>Avg. unit price</div>
              </div>
              <div>
                <KpiFig value={count(e.unitsTotal)} missing={isMissing(e, d, "unitsTotal")} />
                <div className="kpi-hint" style={{ marginTop: 8 }}>Units sold</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "38px 36px 30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".18em", color: "var(--c-mute)", textTransform: "uppercase" }}>Ordered sales · USD</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--c-white)", marginTop: 6 }}>Monthly ramp</div>
              </div>
              <div style={{ display: "flex", gap: 18, fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--c-mute)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 16, height: 10, background: "var(--c-yellow)", borderRadius: 2 }} />
                  <Val v={usd(e.salesTotal, "detailed")} missing={isMissing(e, d, "salesTotal")} />
                </span>
              </div>
            </div>
            <SalesBars series={e.salesMonthly ?? []} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--c-mute)", marginTop: 8, textAlign: "center" }}>Ordered sales by month · {period}</div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const ProductMix: SlideComponent = ({ content, e, d }) => {
  const rev = (e.topByRevenue ?? []).slice(0, 3);
  const units = (e.topByUnits ?? []).slice(0, 3);
  const revMax = rev[0]?.value ?? 0;
  const unitsMax = units[0]?.value ?? 0;
  return (
    <SlideShell label="Product Mix">
      <div className="slide-frame">
        <Topbar left={<>{Num("07")} &nbsp;·&nbsp; Product Mix</>} right="Where revenue concentrates" />
        <div style={{ marginTop: 14 }}>
          <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 78 }}>
            <Copy content={content} k="headline" /> <span style={Y}><Copy content={content} k="headlineAccent" /></span>
          </h1>
          <p className="body" style={{ maxWidth: "60ch", color: "var(--c-mute-2)", fontSize: 24, marginTop: 18 }}>
            <Copy content={content} k="body" />
          </p>
        </div>
        <div style={{ marginTop: 26, flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
          <div className="card" style={{ padding: "30px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="chan sc" style={{ alignSelf: "flex-start" }}><i />Top ASINs · by revenue</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 4 }}>
              {rev.map((r) => (
                <div key={r.asin}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, alignItems: "baseline", gap: 12 }}>
                    <span style={{ whiteSpace: "nowrap" }}>{truncTitle(r.title)}</span>
                    <strong style={{ color: "var(--c-white)" }}>{usd(r.value, "detailed")}</strong>
                  </div>
                  <div style={{ height: 12, background: "var(--c-ink-70)", borderRadius: 6, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: `${revMax > 0 ? (r.value / revMax) * 100 : 0}%`, height: "100%", background: "var(--c-yellow)" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "auto", fontFamily: "var(--font-mono)", fontSize: 21, color: "var(--c-mute)", paddingTop: 8 }}>
              Top {rev.length} ASINs = <strong style={Y}><Val v={pct(d.top3RevenueSharePct, 0)} missing={isMissing(e, d, "top3RevenueSharePct")} /></strong> of revenue
            </div>
          </div>
          <div className="card" style={{ padding: "30px 36px", display: "flex", flexDirection: "column", gap: 18, borderColor: "rgba(95,166,181,.3)" }}>
            <div className="chan sc" style={{ alignSelf: "flex-start", background: "rgba(95,166,181,.16)", color: "#8FC6D2" }}><i style={{ background: "#5FA6B5" }} />Top ASINs · by units</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 4 }}>
              {units.map((r) => (
                <div key={r.asin}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, alignItems: "baseline", gap: 12 }}>
                    <span style={{ whiteSpace: "nowrap" }}>{truncTitle(r.title)}</span>
                    <strong style={{ color: "var(--c-white)" }}>{count(r.value)}</strong>
                  </div>
                  <div style={{ height: 12, background: "var(--c-ink-70)", borderRadius: 6, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: `${unitsMax > 0 ? (r.value / unitsMax) * 100 : 0}%`, height: "100%", background: "#5FA6B5" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "auto", fontFamily: "var(--font-mono)", fontSize: 21, color: "var(--c-mute)", paddingTop: 8 }}>
              <Val v={count(e.unitsTotal)} missing={isMissing(e, d, "unitsTotal")} /> units across <strong style={{ color: "#8FC6D2" }}><Val v={count(e.skuCount)} missing={isMissing(e, d, "skuCount")} /></strong> SKUs
            </div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

const DemandCurve: SlideComponent = ({ content, e, d }) => {
  const { period } = useDeck();
  const peakMissing = isMissing(e, d, "peakMonth") || isMissing(e, d, "peakSales");
  const baseMissing = d.h2AvgSales == null || d.h2VsH1Pct == null;
  const cumMissing = d.cumulative.length === 0;
  return (
    <SlideShell label="Demand Curve">
      <div className="slide-frame">
        <Topbar left={<>{Num("08")} &nbsp;·&nbsp; Demand Curve</>} right={<>Cumulative sales · {period}</>} />
        <div style={{ display: "grid", gridTemplateColumns: ".82fr 1.32fr", gap: 60, marginTop: 32, flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 78 }}>
              <Copy content={content} k="headline" /><br />
              <span style={Y}><Val v={usd(d.cumulative.at(-1)?.value, "detailed")} missing={cumMissing} /></span>
              <Copy content={content} k="headlineTail" />
            </h1>
            <p className="body" style={{ maxWidth: "32ch", color: "var(--c-mute-2)", fontSize: 25 }}>
              <Copy content={content} k="body" />
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
              <div className="card" style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 20, borderColor: "rgba(247,191,29,.3)" }}>
                <div className="chan sc" style={{ flexShrink: 0 }}><i />Peak</div>
                <div style={{ fontSize: 23, color: "var(--c-mute-2)" }}>
                  {peakMissing ? <Val v="—" missing /> : <>{monthShort(d.peakMonth!)} {d.peakMonth!.slice(0, 4)} — <strong style={{ color: "var(--c-white)" }}>{usd(d.peakSales, "detailed")}</strong> ordered sales</>}
                </div>
              </div>
              <div className="card" style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}>
                <div className="chan sc" style={{ flexShrink: 0 }}><i />Base</div>
                <div style={{ fontSize: 23, color: "var(--c-mute-2)" }}>
                  {baseMissing ? <Val v="—" missing /> : (
                    <>H2 base — <strong style={{ color: "var(--c-white)" }}>{usd(d.h2AvgSales, "detailed")}</strong> / month — <strong style={{ color: "#6CE0A3" }}>{d.h2VsH1Pct! >= 0 ? "▲ +" : "▼ "}{pct(Math.abs(d.h2VsH1Pct!), 0)}</strong> vs H1</>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: "38px 36px 30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 18 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".18em", color: "var(--c-mute)", textTransform: "uppercase" }}>Cumulative ordered sales</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 8 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 60, color: "var(--c-white)", letterSpacing: "-.03em", lineHeight: 1 }}>
                    <Val v={usd(d.cumulative.at(-1)?.value, "detailed")} missing={cumMissing} />
                  </div>
                  <div className="kpi-up">▲ full year</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 18, fontFamily: "var(--font-mono)", fontSize: 21, color: "var(--c-mute)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 16, height: 3, background: "var(--c-yellow)", borderRadius: 2 }} />Cumulative sales
                </span>
              </div>
            </div>
            <CumulativeCurve series={d.cumulative} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--c-mute)", marginTop: 6, textAlign: "center" }}>Cumulative ordered sales · {period}</div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

function ChannelCard({ title, block, acos, gradientId }: { title: string; block?: ChannelBlock; acos: number | null; gradientId: string }) {
  const spendFig = block ? splitMetric(usd(block.spend, "detailed")) : null;
  const salesFig = block ? splitMetric(usd(block.sales, "detailed")) : null;
  const acosFig = block ? splitMetric(pct(acos, 0)) : null;
  const ordersFig = block ? splitMetric(count(block.orders)) : null;
  return (
    <div style={{ background: "var(--c-ink-90)", border: "1px solid rgba(247,191,29,.28)", borderRadius: 18, padding: "26px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div className="chan sc"><i />{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,auto)", gap: "14px 30px", marginLeft: "auto" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "#5FA6B5" }}>Spend</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--c-white)", marginTop: 3 }}>
              <Val v={spendFig?.num ?? "—"} missing={!block} />{spendFig?.unit && <span style={{ color: "var(--c-mute-2)", fontSize: ".55em" }}>{spendFig.unit}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "#F39A1F" }}>Sales</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--c-white)", marginTop: 3 }}>
              <Val v={salesFig?.num ?? "—"} missing={!block} />{salesFig?.unit && <span style={{ color: "var(--c-mute-2)", fontSize: ".55em" }}>{salesFig.unit}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "#E25CFF" }}>ACOS</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--c-white)", marginTop: 3 }}>
              <Val v={acosFig?.num ?? "—"} missing={!block} />{acosFig?.unit && <span style={{ color: "var(--c-mute-2)", fontSize: ".55em" }}>{acosFig.unit}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "#6CE0A3" }}>Orders</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--c-white)", marginTop: 3 }}>
              <Val v={ordersFig?.num ?? "—"} missing={!block} />{ordersFig?.unit && <span style={{ color: "var(--c-mute-2)", fontSize: ".55em" }}>{ordersFig.unit}</span>}
            </div>
          </div>
        </div>
      </div>
      {block ? (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--c-mute)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 3, background: "#F7BF1D", borderRadius: 2 }} />Ad sales</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 3, background: "#5FA6B5", borderRadius: 2 }} />Spend</span>
          </div>
          <SpendSalesLines block={block} gradientId={gradientId} />
          <div style={{ position: "relative", height: 24, fontFamily: "var(--font-mono)", fontSize: 17, color: "var(--c-mute)", display: "flex", justifyContent: "space-between" }}>
            <MonthTicks months={block.monthly.map((m) => m.month)} want={6} />
          </div>
        </>
      ) : (
        <div style={{ padding: "40px 0", textAlign: "center" }}><MissingChip /></div>
      )}
    </div>
  );
}

const PaidMedia: SlideComponent = ({ content, e, d }) => {
  const { num: adSalesNum, unit: adSalesUnit } = splitMetric(usd(e.adSales, "detailed"));
  return (
    <SlideShell label="Paid Media">
      <div className="slide-frame">
        <Topbar left={<>{Num("09")} &nbsp;·&nbsp; Paid Media</>} right="Full-funnel · Sponsored Ads" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.28fr", gap: 72, marginTop: 24, flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <h1 className="title-xl" style={{ color: "var(--c-white)", fontSize: 76 }}>Full-funnel<br /><span style={Y}>paid media,</span><br />optimised daily.</h1>
            <p className="body" style={{ maxWidth: "36ch", color: "var(--c-mute-2)", fontSize: 23, lineHeight: 1.5 }}>
              <Copy content={content} k="body" />
            </p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 26, marginTop: 2 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 172, lineHeight: .85, letterSpacing: "-.04em", color: "var(--c-yellow)" }}>
                <Val v={adSalesNum} missing={isMissing(e, d, "adSales")} />
                {adSalesUnit && <span style={{ fontSize: ".42em" }}>{adSalesUnit}</span>}
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 23, color: "var(--c-mute-2)", lineHeight: 1.35, maxWidth: "20ch", paddingBottom: 16 }}>
                in ad-attributed sales on <span style={{ color: "var(--c-white)" }}><Val v={usd(e.adSpend, "detailed")} missing={isMissing(e, d, "adSpend")} /></span> spend — a <Val v={mult(d.roas)} missing={isMissing(e, d, "roas")} /> blended ROAS.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <ChannelCard title="Sponsored Products" block={e.paidSp} acos={d.spAcos} gradientId="ppcSp" />
            <ChannelCard title="Sponsored Brands + Display" block={e.paidSbSd} acos={d.sbSdAcos} gradientId="ppcSbSd" />
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

export const DETAILED_B = { sales_growth: SalesGrowth, product_mix: ProductMix, demand_curve: DemandCurve, paid_media: PaidMedia };
