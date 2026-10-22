/* eslint-disable react-doctor/no-array-index-as-key */
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';

const MAX_CARDS = 6;

export function DirectionsSection({ data }: { data: Report }) {
  const items = data.goals ?? [];
  if (items.length === 0) return null;

  const num = sectionNumber(data.sections, 'goals');
  const cards = items.slice(0, MAX_CARDS);
  const overflow = items.slice(MAX_CARDS);
  const opener = items[0];

  return (
    <section id="goals">
      <div className="container">
        <span className="section-tag">Section {num} · Directions</span>
        <h1>Next-month<em>Directions</em></h1>

        <div className="pullquote">
          <em>{opener.body}</em>
        </div>

        <div className="insights">
          {cards.map((g, i) => (
            <div key={i} className="insight">
              <div className="insight-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{g.title}</h4>
              <p>{g.body}</p>
              <p className="muted">Owner: {g.owner} · Success: {g.success}</p>
            </div>
          ))}
        </div>

        {overflow.length > 0 && (
          <ul className="regular">
            {overflow.map((g, i) => (
              <li key={i}><strong>{g.title}.</strong> {g.body}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
