/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';
import { MultiLineChart } from '../charts/MultiLineChart';
import { resolveAccent } from '../defaults';

const COMPACT_INT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function fmtPctAxis(v: number): string {
  return `${v.toFixed(0)}%`;
}

function fmtMoneyAxis(v: number): string {
  if (v >= 1000) return `$${COMPACT_INT.format(v)}`;
  return `$${v.toFixed(0)}`;
}

/**
 * Section 02 — Campaign Manager. Mirrors Amazon Seller Central's Campaign
 * Manager Performance dashboard: 4-stat bar over a multi-line daily chart of
 * Total Sales, Ad Spend, Ad Revenue (right $ axis) and ACoS (left % axis).
 */
export function CampaignManagerSection({ data }: { data: Report }) {
  const c = data.campaigns;
  if (!c) return null;
  // Defend against cached payloads that predate the totalSales/acos shape.
  if (!c.series?.totalSales || !c.series?.adSpend || !c.series?.adRevenue || !c.series?.acos) {
    return null;
  }

  const num = sectionNumber(data.sections, 'campaigns');
  const accent = resolveAccent(data.meta.accent);
  const acosColor = '#D9433F';      // Amazon-style red for ACoS
  const revenueColor = '#2F7A3A';   // green for ad revenue
  const spendColor = '#5B4690';     // purple for ad spend

  return (
    <section id="campaigns">
      <div className="container">
        <span className="section-tag">Section {num} · Campaign Manager</span>
        <h1>Campaign<em>Manager</em></h1>
        <p className="lead">
          Amazon Ads performance for {data.meta.month}. Total sales, ad spend,
          ad revenue, and ACoS rolled up across all sponsored campaigns.
        </p>

        <div className="snapshot-label">Performance · {c.dateRange}</div>
        <div className="stats-bar">
          {c.stats.map((s, i) => {
            const cls = s.direction === 'down' ? 'crit' : s.direction === 'up' ? 'ok' : 'brand';
            const glyph = s.direction === 'up' ? '▲' : s.direction === 'down' ? '▼' : '—';
            return (
              <div key={i} className="stat-cell">
                <div className="stat-label">{s.label}</div>
                <div className={`stat-value ${cls}`}>{s.value}</div>
                {s.delta ? (
                  <div className="stat-meta">{glyph} {s.delta}{s.prev ? ` · prev ${s.prev}` : ''}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="chart-card">
          <div className="chart-card-meta">
            <div className="chart-card-title">Total Sales, Ad Spend, Ad Revenue, &amp; ACoS — {c.dateRange}</div>
            <div className="chart-card-axis">% · USD · daily</div>
          </div>
          <MultiLineChart
            series={[
              { name: 'ACoS',        color: acosColor,    axis: 'left',  data: c.series.acos },
              { name: 'Total Sales', color: accent,       axis: 'right', data: c.series.totalSales },
              { name: 'Ad Spend',    color: spendColor,   axis: 'right', dash: '3,3', data: c.series.adSpend },
              { name: 'Ad Revenue',  color: revenueColor, axis: 'right', data: c.series.adRevenue },
            ]}
            leftLabel="ACoS"
            rightLabel="USD"
            formatLeft={fmtPctAxis}
            formatRight={fmtMoneyAxis}
          />
          <div className="chart-legend">
            <span className="legend-item"><span className="swatch" style={{ background: acosColor }} /> ACoS</span>
            <span className="legend-item"><span className="swatch" style={{ background: accent }} /> Total Sales</span>
            <span className="legend-item"><span className="swatch" style={{ background: spendColor }} /> Ad Spend (dashed)</span>
            <span className="legend-item"><span className="swatch" style={{ background: revenueColor }} /> Ad Revenue</span>
          </div>
        </div>
      </div>
    </section>
  );
}
