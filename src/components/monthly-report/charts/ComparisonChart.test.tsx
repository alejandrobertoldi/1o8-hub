import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComparisonChart } from './ComparisonChart';

describe('ComparisonChart', () => {
  it('returns null when series is empty', () => {
    const { container } = render(<ComparisonChart series={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when first series has no data points', () => {
    const { container } = render(
      <ComparisonChart series={[{ name: 'Actual', data: [] }]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when first series has only one data point', () => {
    const { container } = render(
      <ComparisonChart series={[{ name: 'Actual', data: [{ label: 'Jan', value: 10 }] }]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders an svg when data is present', () => {
    const { container } = render(
      <ComparisonChart series={[{ name: 'Actual', data: [
        { label: 'Jan', value: 10 },
        { label: 'Feb', value: 20 },
      ]}]} />
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
