/* eslint-disable react-doctor/nextjs-no-img-element */
import React from 'react';
import type { Report } from '../types';
import { clientLogoSrc } from '../client-logo';

/**
 * Splits "March 2026" into { month: "March", year: "2026" }.
 * Falls back to the full string in `month` if the input has no space.
 */
function splitMonthYear(label: string): { month: string; year: string } {
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return { month: label, year: '' };
  return {
    month: parts.slice(0, -1).join(' '),
    year: parts[parts.length - 1],
  };
}

export function CoverHeader({ data }: { data: Report }) {
  const { meta } = data;
  const { month, year } = splitMonthYear(meta.month);
  const logo = clientLogoSrc(meta.clientIdCode);
  const [logoFailed, setLogoFailed] = React.useState(false);

  return (
    <header className="cover" id="cover">
      <div className="cover-logo">
        <img src="/1o8_Logo_Ink.png" alt="1o8 Agency" />
      </div>
      <div className="container cover-body">
        <div className="cover-top">
          <div className="cover-eyebrow">{meta.client} · Performance</div>
          <h1 className="cover-title">
            Monthly<em>Performance</em> Report
          </h1>
        </div>
        {logo && !logoFailed && (
          <div className="cover-client-logo">
            <img
              src={logo}
              alt={`${meta.client} logo`}
              onError={() => setLogoFailed(true)}
            />
          </div>
        )}
        <div className="cover-period">
          <span className="month">{month}</span>
          {year && <span className="year">{year}</span>}
        </div>
        <div className="cover-meta">
          <div><div className="label">Client</div><div className="value">{meta.client}</div></div>
          <div><div className="label">Period</div><div className="value">{meta.period}</div></div>
          <div><div className="label">Issued</div><div className="value">{meta.issued}</div></div>
          <div><div className="label">Account Manager</div><div className="value">{meta.lead}</div></div>
          <div><div className="label">Report ID</div><div className="value">{meta.reportId}</div></div>
        </div>
      </div>
    </header>
  );
}
