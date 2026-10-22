/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';

export function AppendixSection({ data }: { data: Report }) {
  const a = data.appendix;
  if (!a) return null;

  const num = sectionNumber(data.sections, 'appendix');

  return (
    <section id="appendix">
      <div className="container">
        <span className="section-tag">Section {num} · Appendix</span>
        <h1>Appendix</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <h3>Methodology</h3>
            <p>{a.methodology}</p>

            <h3>Sources of truth</h3>
            <table className="dt">
              <tbody>
                {a.sources.map(([d, s], i) => (
                  <tr key={i}><td>{d}</td><td>{s}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3>Glossary</h3>
            <table className="dt">
              <tbody>
                {a.glossary.map(([t, def], i) => (
                  <tr key={i}><td><strong>{t}</strong></td><td>{def}</td></tr>
                ))}
              </tbody>
            </table>

            <h3>Change log</h3>
            {a.changelog.length === 0 ? (
              <p className="muted">No changes logged this issue.</p>
            ) : (
              <ul className="regular">
                {a.changelog.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
