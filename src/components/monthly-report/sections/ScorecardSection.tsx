/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report, Risk } from '../types';
import { sectionNumber } from '../shell/section-number';

function gradeFor(r: Risk): 'red' | 'amber' | 'green' {
  if (r.grade) return r.grade;
  if (r.severity === 'high') return 'red';
  if (r.severity === 'med') return 'amber';
  return 'green';
}

export function ScorecardSection({ data }: { data: Report }) {
  const items = data.risks ?? [];
  if (items.length === 0) return null;

  const num = sectionNumber(data.sections, 'risks');

  return (
    <section id="risks" className="dark">
      <div className="container">
        <span className="section-tag">Section {num} · Scorecard</span>
        <h1>Health<em>Scorecard</em></h1>
        <p className="lead">Open risks and mitigations as of {data.meta.issued}.</p>

        <table className="dt">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Owner</th>
              <th>Impact</th>
              <th>Status</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const g = gradeFor(r);
              return (
                <tr key={i}>
                  <td>{r.item}</td>
                  <td>{r.owner}</td>
                  <td>{r.impact}</td>
                  <td>{r.status}</td>
                  <td><span className={`grade-pill ${g}`}>{g}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
