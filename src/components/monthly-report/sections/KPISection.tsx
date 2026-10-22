/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report, KPI } from '../types';
import { sectionNumber } from '../shell/section-number';
import { ComparisonChart } from '../charts/ComparisonChart';
import { resolveAccent } from '../defaults';

/**
 * Picks the cell modifier class for a stat-value based on direction + highlight.
 * Direction wins when it's not flat; highlight is the fallback for flat metrics.
 */
function statValueClass(k: KPI): string {
  if (k.direction === 'down') return 'crit';
  if (k.direction === 'up') return 'ok';
  if (k.highlight) return 'brand';
  return '';
}

function directionGlyph(d: KPI['direction']): string {
  return d === 'up' ? '▲' : d === 'down' ? '▼' : '—';
}

export function KPISection({ data }: { data: Report }) {
  const kpis = data.kpis ?? [];
  if (kpis.length === 0) return null;

  const num = sectionNumber(data.sections, 'kpis');
  const snapshot = kpis.slice(0, 5);   // 5-col Amazon-style snapshot bar
  const secondary = kpis.slice(5);     // CVR, Buy-box etc. as hero cells
  const compare = data.compareSales;
  const accent = resolveAccent(data.meta.accent);
  // data.meta.month is "March 2026" → split into name + year for the compare-table row labels.
  const [monthName, currYear] = data.meta.month.split(' ');
  const prevYear = String(Number(currYear) - 1);
  const compareRowLabels: [string, string, string] = [
    `${monthName}|${currYear}`,
    `${monthName}|${prevYear}`,
    `${monthName}|${currYear}-${prevYear} YoY`,
  ];

  return (
    <section id="kpis">
      <div className="container">
        <span className="section-tag">Section {num} · Sales Dashboard</span>
        <h1>Sales<em>Dashboard</em></h1>
        <p className="lead">
          Headline performance for {data.meta.month}, with deltas against the prior month.
        </p>

        <div className="snapshot-label">Sales Snapshot · {data.meta.month}</div>
        <div className="stats-bar stats-bar--5">
          {snapshot.map((k, i) => {
            const cls = statValueClass(k);
            return (
              <div key={i} className="stat-cell">
                <div className="stat-label">{k.label}</div>
                <div className={`stat-value${cls ? ' ' + cls : ''}`}>{k.value}</div>
                <div className="stat-meta">
                  {directionGlyph(k.direction)} {k.delta}
                </div>
              </div>
            );
          })}
        </div>

        {compare && (
          <>
            <div className="chart-pair">
              <div className="chart-card">
                <div className="chart-card-meta">
                  <div className="chart-card-title">Sales $ — {compare.currentLabel} vs {compare.previousLabel}</div>
                  <div className="chart-card-axis">USD · daily</div>
                </div>
                <ComparisonChart
                  series={[
                    { name: compare.currentLabel, data: compare.sales },
                    { name: compare.previousLabel, data: compare.salesPrev },
                  ]}
                  accent={accent}
                />
              </div>
              <div className="chart-card">
                <div className="chart-card-meta">
                  <div className="chart-card-title">Units # — {compare.currentLabel} vs {compare.previousLabel}</div>
                  <div className="chart-card-axis">Units · daily</div>
                </div>
                <ComparisonChart
                  series={[
                    { name: compare.currentLabel, data: compare.units },
                    { name: compare.previousLabel, data: compare.unitsPrev },
                  ]}
                  accent={accent}
                />
              </div>
            </div>

            <table className="dt compare-table">
              <thead>
                <tr>
                  <th></th>
                  {compare.table.columns.map((c, i) => (
                    <th key={i} className="r">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{compareRowLabels[0]}</td>
                  {compare.table.current.map((v, i) => <td key={i} className="r">{v}</td>)}
                </tr>
                <tr>
                  <td>{compareRowLabels[1]}</td>
                  {compare.table.previous.map((v, i) => <td key={i} className="r">{v}</td>)}
                </tr>
                <tr>
                  <td>{compareRowLabels[2]}</td>
                  {compare.table.changes.map((c, i) => {
                    const cls = c.direction === 'up' ? 'ok' : c.direction === 'down' ? 'crit' : '';
                    return <td key={i} className={`r ${cls}`}>{c.value}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </>
        )}

        {secondary.length > 0 && (
          <div className="hero-stat">
            {secondary.map((k, i) => {
              const cls = k.direction === 'up' ? 'positive'
                        : k.direction === 'down' ? 'crit'
                        : k.highlight ? 'brand'
                        : '';
              return (
                <div key={i} className="hero-cell">
                  <div className="label">{k.label}</div>
                  <div className={`value${cls ? ' ' + cls : ''}`}>{k.value}</div>
                  <div className="meta">{directionGlyph(k.direction)} {k.delta} · {k.foot}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
