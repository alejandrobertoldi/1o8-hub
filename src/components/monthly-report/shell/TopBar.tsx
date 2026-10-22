/* eslint-disable react-doctor/nextjs-no-img-element */
import React from 'react';
import type { Report } from '../types';

export function TopBar({ data }: { data: Report }) {
  const { meta } = data;
  return (
    <div className="top-bar">
      <div className="container top-bar-inner">
        <span className="logo-wrap">
          <span className="logo-tag">Monthly Report</span>
        </span>
        <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>
          {meta.client.toUpperCase()} · {meta.month.toUpperCase()}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="print-btn"
            onClick={() => { if (typeof window !== 'undefined') window.print(); }}
          >
            ⌘P · Export PDF
          </button>
          <span className="confidential">Internal · Confidential</span>
        </span>
      </div>
    </div>
  );
}
