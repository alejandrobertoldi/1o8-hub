/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-tiny-text */
import React from 'react';
import type { Report, ProductRow } from '../types';
import { classifyMetric, type MetricBand } from '@/lib/monthly-report/thresholds';
import { sectionNumber } from '../shell/section-number';

const DOLLAR = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US');
const PCT = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;

/**
 * Maps the threshold engine's "good"/"warn"/"bad" band names to the
 * .dt table's "ok"/"warn"/"crit" cell modifier class names.
 */
function bandClass(b: MetricBand): string {
  if (b === 'good') return 'ok';
  if (b === 'bad') return 'crit';
  if (b === 'warn') return 'warn';
  return '';
}

function sum<T>(xs: T[], pick: (t: T) => number): number {
  return xs.reduce((a, t) => a + pick(t), 0);
}

export function ProductsSection({ data }: { data: Report }) {
  const allRows = data.products ?? [];
  if (allRows.length === 0) return null;

  const rows = allRows.toSorted((a, b) => b.sales - a.sales);

  const grand = {
    sessions: sum(rows, r => r.sessions),
    units: sum(rows, r => r.units),
    sales: sum(rows, r => r.sales),
  };

  const num = sectionNumber(data.sections, 'products');

  return (
    <section id="products" className="soft">
      <div className="container">
        <span className="section-tag">Section {num} · Products</span>
        <h1>Product<em>Performance</em></h1>
        <p className="lead">
          Per-ASIN breakdown sorted by sales. CVR and buy-box cells use the
          monthly-report config thresholds.
        </p>

        <table className="dt">
          <thead>
            <tr>
              <th>Product</th>
              <th className="r">Sessions</th>
              <th className="r">Units</th>
              <th className="r">Sales</th>
              <th className="r">CVR</th>
              <th className="r">Buy-box</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: ProductRow) => (
              <tr key={r.asin}>
                <td className="product-title" title={r.title}>{r.title}</td>
                <td className="r">{INT.format(r.sessions)}</td>
                <td className="r">{INT.format(r.units)}</td>
                <td className="r">{DOLLAR.format(r.sales)}</td>
                <td className={`r ${bandClass(classifyMetric(r.cvr, 'cvr'))}`}>{PCT(r.cvr)}</td>
                <td className={`r ${bandClass(classifyMetric(r.buyBox, 'buyBox'))}`}>{PCT(r.buyBox)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td className="r">{INT.format(grand.sessions)}</td>
              <td className="r">{INT.format(grand.units)}</td>
              <td className="r">{DOLLAR.format(grand.sales)}</td>
              <td className="r">—</td>
              <td className="r">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
