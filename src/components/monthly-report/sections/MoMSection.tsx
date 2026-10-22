/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report } from '../types';
import { BarChart } from '../charts/BarChart';
import { ComparisonChart } from '../charts/ComparisonChart';
import { resolveAccent } from '../defaults';
import { sectionNumber } from '../shell/section-number';

export function MoMSection({ data }: { data: Report }) {
  const m = data.mom;
  if (!m) return null;

  const accent = resolveAccent(data.meta.accent);
  const hasTarget = (m.revenueTargetSeries?.length ?? 0) > 0;
  const hasCAC = (m.cacSeries?.length ?? 0) > 0;
  const series = [
    { name: 'Actual', data: m.revenueSeries },
    ...(hasTarget ? [{ name: 'Target', data: m.revenueTargetSeries! }] : []),
  ];
  const cacData = hasCAC
    ? m.cacSeries!.map((p, i) => ({
        ...p,
        highlight: m.highlightLastCac && i === m.cacSeries!.length - 1,
      }))
    : [];

  const num = sectionNumber(data.sections, 'mom');
  const firstLabel = m.revenueSeries[0]?.label ?? '';
  const lastLabel = m.revenueSeries.at(-1)?.label ?? '';

  return (
    <section id="mom" className="soft">
      <div className="container">
        <span className="section-tag">Section {num} · Trends</span>
        <h1>Month-over-<em>month</em></h1>
        <p className="lead">{m.narrative}</p>

        <div className="chart-card">
          <div className="chart-card-meta">
            <div className="chart-card-title">Revenue vs. target</div>
            <div className="chart-card-axis">USD · {firstLabel} → {lastLabel}</div>
          </div>
          {m.revenueSeries.length > 0 ? (
            <ComparisonChart series={series} accent={accent} />
          ) : (
            <p className="muted" style={{ padding: '32px 0', textAlign: 'center' }}>
              No revenue data available for {data.meta.month}.
            </p>
          )}
        </div>

        {hasCAC && (
          <div className="chart-card">
            <div className="chart-card-meta">
              <div className="chart-card-title">Blended CAC</div>
              <div className="chart-card-axis">USD · {firstLabel} → {lastLabel}</div>
            </div>
            <BarChart data={cacData} accent={accent} />
          </div>
        )}

        <table className="dt">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="r">Prev</th>
              <th className="r">Curr</th>
              <th className="r">Δ</th>
            </tr>
          </thead>
          <tbody>
            {m.table.map((r, i) => {
              const cls = r.deltaDirection === 'up' ? 'ok'
                        : r.deltaDirection === 'down' ? 'crit'
                        : '';
              return (
                <tr key={i}>
                  <td>{r.metric}</td>
                  <td className="r">{r.prev}</td>
                  <td className="r">{r.curr}</td>
                  <td className={`r ${cls}`}>{r.delta}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>{m.narrative}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
