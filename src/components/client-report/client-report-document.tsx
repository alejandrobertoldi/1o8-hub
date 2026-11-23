/* eslint-disable @next/next/no-img-element -- data URLs and static assets in a print document */
import type {
  ClientReportData,
  KpiCard,
  MetricRow,
  ReportSection,
} from "@/lib/client-report/types";
import { cn } from "@/lib/utils";
import { DailyBars, MonthBars } from "./charts";
import { fmt, fmtChange, type Change } from "./format";
import "./client-report.css";

/**
 * The client monthly report as US Letter pages: cover, KPIs at a glance, then
 * one page per data source. Same markup on screen (`screen`) and in the PDF.
 */
export function ClientReportDocument({
  data,
  screen = false,
}: {
  data: ClientReportData;
  screen?: boolean;
}) {
  const sectionPages = splitSections(data.sections);
  const pages = 2 + sectionPages.length;
  return (
    <div className={cn("cr-doc", screen && "cr-screen")}>
      <Cover data={data} />
      <GlancePage data={data} page={2} pages={pages} />
      {sectionPages.map((sp, i) => (
        <SectionPage
          key={`${sp.section.key}-${i}`}
          data={data}
          {...sp}
          page={3 + i}
          pages={pages}
        />
      ))}
    </div>
  );
}

type SectionPageSpec = {
  section: ReportSection;
  title: string;
  groups: ReportSection["groups"];
  charts: boolean;
};

/**
 * One page per section; a section with several groups (paid media: all
 * platforms, Meta, Google Ads) puts the first group and the charts on its
 * page and the rest on a second one, so nothing runs off the page.
 */
function splitSections(sections: ReportSection[]): SectionPageSpec[] {
  return sections.flatMap((section) =>
    section.groups.length > 1
      ? [
          {
            section,
            title: section.title,
            groups: section.groups.slice(0, 1),
            charts: true,
          },
          {
            section,
            title: `${section.title} by platform`,
            groups: section.groups.slice(1),
            charts: false,
          },
        ]
      : [
          {
            section,
            title: section.title,
            groups: section.groups,
            charts: true,
          },
        ],
  );
}

const issued = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

function Cover({ data }: { data: ClientReportData }) {
  return (
    <section className="cr-page cr-cover">
      <img src="/1o8_Logo_Ink.png" alt="1o8" className="cr-cover-logo" />
      <div className="cr-cover-main">
        {data.client.logo && (
          <div className="cr-cover-client-logo">
            <img src={data.client.logo} alt={`${data.client.name} logo`} />
          </div>
        )}
        <div>
          <span className="cr-eyebrow">Monthly performance report</span>
        </div>
        <h1>{data.client.name}</h1>
        <div className="cr-cover-month">{data.period.label}</div>
      </div>
      <div className="cr-cover-foot">
        <div>
          {data.preparedBy && (
            <>
              Prepared by
              <strong>{data.preparedBy}, 1o8</strong>
            </>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          Issued
          <strong>{issued(data.generatedAt)}</strong>
        </div>
      </div>
    </section>
  );
}

function Footer({
  data,
  page,
  pages,
}: {
  data: ClientReportData;
  page: number;
  pages: number;
}) {
  return (
    <div className="cr-footer">
      <span>
        1o8 · {data.client.name} · {data.period.label}
      </span>
      <span className="cr-page-dot" aria-label={`Page ${page} of ${pages}`}>
        {page}
      </span>
    </div>
  );
}

function ChangeText({ change }: { change: Change }) {
  if (!change) return <span className="cr-flat">—</span>;
  return <span className={`cr-${change.tone}`}>{change.text}</span>;
}

function Kpi({ k, data }: { k: KpiCard; data: ClientReportData }) {
  return (
    <div className="cr-kpi">
      <div className="cr-kpi-label">{k.label}</div>
      <div className="cr-kpi-value">{fmt(k.value, k.unit)}</div>
      <div className="cr-kpi-row">
        <span>vs {data.period.previousLabel.split(" ")[0]}</span>
        <ChangeText
          change={fmtChange(k.value, k.previous, k.unit, k.lowerIsBetter)}
        />
      </div>
      <div className="cr-kpi-row">
        <span>vs {data.period.lastYearLabel}</span>
        <ChangeText
          change={fmtChange(k.value, k.lastYear, k.unit, k.lowerIsBetter)}
        />
      </div>
      {k.target && (
        <span
          className={cn(
            "cr-target",
            k.onTrack === true && "good",
            k.onTrack === false && "bad",
          )}
        >
          Target {k.target}
          {k.onTrack === true
            ? " · met"
            : k.onTrack === false
              ? " · missed"
              : ""}
        </span>
      )}
    </div>
  );
}

function GlancePage({
  data,
  page,
  pages,
}: {
  data: ClientReportData;
  page: number;
  pages: number;
}) {
  return (
    <section className="cr-page">
      <span className="cr-eyebrow">At a glance</span>
      <h2 className="cr-title">{data.period.label} in numbers</h2>
      <p className="cr-subtitle">
        Compared with {data.period.previousLabel} and with{" "}
        {data.period.lastYearLabel}.
      </p>
      {data.kpis.length ? (
        <div className="cr-kpis">
          {data.kpis.map((k) => (
            <Kpi key={k.key} k={k} data={data} />
          ))}
        </div>
      ) : (
        <p className="cr-note">No KPI data for this month yet.</p>
      )}
      {data.kpiTrend && (
        <div className="cr-card">
          <div className="cr-card-title">
            {data.kpiTrend.label}{" "}
            <span>last {data.kpiTrend.points.length} months</span>
          </div>
          <MonthBars series={data.kpiTrend} />
        </div>
      )}
      <Footer data={data} page={page} pages={pages} />
    </section>
  );
}

function Row({ r }: { r: MetricRow }) {
  return (
    <tr>
      <td>
        {r.label}
        {r.hint && <span className="cr-hint">{r.hint}</span>}
      </td>
      <td className="cr-now">{fmt(r.value, r.unit)}</td>
      <td>{fmt(r.previous, r.unit)}</td>
      <td>
        <ChangeText
          change={fmtChange(r.value, r.previous, r.unit, r.lowerIsBetter)}
        />
      </td>
      <td>{fmt(r.lastYear, r.unit)}</td>
      <td>
        <ChangeText
          change={fmtChange(r.value, r.lastYear, r.unit, r.lowerIsBetter)}
        />
      </td>
    </tr>
  );
}

function SectionPage({
  data,
  section,
  title,
  groups,
  charts,
  page,
  pages,
}: SectionPageSpec & { data: ClientReportData; page: number; pages: number }) {
  const month = data.period.label.split(" ")[0];
  const titled = groups.length > 1 || section.groups.length > 1;
  return (
    <section className="cr-page">
      <span className="cr-eyebrow">{section.source}</span>
      <h2 className="cr-title">{title}</h2>
      <p className="cr-subtitle">{data.period.label}</p>
      <table className="cr-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>{month}</th>
            <th>{data.period.previousLabel.split(" ")[0]}</th>
            <th>Change</th>
            <th>{data.period.lastYearLabel}</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows
              key={g.title ?? "all"}
              title={titled ? g.title : null}
              rows={g.rows}
            />
          ))}
        </tbody>
      </table>
      {charts && (
        <div className="cr-charts">
          {section.daily && (
            <div className="cr-card">
              <div className="cr-card-title">
                {section.daily.label} <span>by day</span>
              </div>
              <DailyBars series={section.daily} />
            </div>
          )}
          {section.trend && (
            <div className="cr-card">
              <div className="cr-card-title">
                {section.trend.label} <span>by month</span>
              </div>
              <MonthBars series={section.trend} height={150} />
            </div>
          )}
        </div>
      )}
      <Footer data={data} page={page} pages={pages} />
    </section>
  );
}

function GroupRows({
  title,
  rows,
}: {
  title: string | null;
  rows: MetricRow[];
}) {
  return (
    <>
      {title && (
        <tr className="cr-group">
          <td colSpan={6}>{title}</td>
        </tr>
      )}
      {rows.map((r) => (
        <Row key={`${title}-${r.key}`} r={r} />
      ))}
    </>
  );
}
