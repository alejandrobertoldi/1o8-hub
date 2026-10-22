/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';

const MAX_CARDS = 6;

export function FindingsSection({ data }: { data: Report }) {
  const items = data.highlights ?? [];
  if (items.length === 0) return null;

  const num = sectionNumber(data.sections, 'highlights');
  const cards = items.slice(0, MAX_CARDS);
  const overflow = items.slice(MAX_CARDS);

  return (
    <section id="highlights">
      <div className="container">
        <span className="section-tag">Section {num} · Findings</span>
        <h1>Key<em>Findings</em></h1>
        <p className="lead">What worked this month, and why it moved the numbers.</p>

        <div className="insights">
          {cards.map((h, i) => (
            <div key={i} className="insight">
              <div className="insight-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{h.title}</h4>
              <p>{h.body}</p>
              {h.meta && <p className="muted">{h.meta}</p>}
            </div>
          ))}
        </div>

        {overflow.length > 0 && (
          <ul className="regular">
            {overflow.map((h, i) => (
              <li key={i}><strong>{h.title}.</strong> {h.body}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
