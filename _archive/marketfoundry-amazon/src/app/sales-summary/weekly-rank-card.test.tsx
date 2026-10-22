import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeeklyRankCard } from "./weekly-rank-card";
import type { WeeklyRankClient, WeeklyRankMetric } from "@/lib/sales-weekly-rank";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="weekly-rank-chart">{children}</div>
    ),
  };
});

const metrics: WeeklyRankMetric[] = [
  { label: "Sales", kind: "currency" },
  { label: "ACoS", kind: "pct", lowerIsBetter: true },
];

const clients: WeeklyRankClient[] = [
  {
    clientIdCode: "C1",
    clientName: "Alpha Co",
    brandName: "Alpha",
    accountIds: ["1"],
    logoSrc: "/client-logos/C1.png",
    values: {
      Sales: { current: 162, previous: 100 },
      ACoS: { current: 30, previous: 20 },
    },
  },
  {
    clientIdCode: "C2",
    clientName: "Beta Co",
    brandName: "Beta",
    accountIds: ["2"],
    logoSrc: "/client-logos/C2.png",
    values: {
      Sales: { current: 72, previous: 100 },
      ACoS: { current: 10, previous: 20 },
    },
  },
];

describe("WeeklyRankCard", () => {
  it("renders ranked insights for week-over-week sales", () => {
    render(
      <WeeklyRankCard
        clients={clients}
        metrics={metrics}
        mode="week"
        periodLabel="2026W36"
        previousPeriodLabel="2026W35"
      />,
    );

    expect(screen.getByTestId("weekly-rank-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly Rank" })).toBeInTheDocument();
    expect(screen.getByText("2026W36 vs 2026W35")).toBeInTheDocument();
    expect(screen.getByText("2026W36")).toBeInTheDocument();
    expect(screen.queryByText("Who grew and who slipped")).not.toBeInTheDocument();
    expect(screen.getByText("Best performer")).toBeInTheDocument();
    expect(screen.getByText("Steepest decline")).toBeInTheDocument();
    expect(screen.getByText("C1")).toBeInTheDocument();
    expect(screen.getByText("C2")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("28%")).toBeInTheDocument();
    expect(document.querySelector(".lucide-trending-up")).toBeTruthy();
    expect(document.querySelector(".lucide-trending-down")).toBeTruthy();
    expect(screen.getByText("2026W35")).toBeInTheDocument();
    expect(screen.queryByText("Last week")).not.toBeInTheDocument();
    expect(screen.queryByText("This week")).not.toBeInTheDocument();
    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Alpha logo" })).toHaveAttribute("src", "/client-logos/C1.png");
    expect(screen.getByRole("img", { name: "Beta logo" })).toHaveAttribute("src", "/client-logos/C2.png");
    expect(screen.getByRole("radio", { name: "Sales" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "ACoS" })).not.toBeChecked();
    expect(screen.getByTestId("weekly-rank-chart-fit")).toBeInTheDocument();
    expect(document.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("re-ranks when a lower-is-better metric is selected", () => {
    render(
      <WeeklyRankCard
        clients={clients}
        metrics={metrics}
        mode="week"
        periodLabel="2026W36"
        previousPeriodLabel="2026W35"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "ACoS" }));
    expect(screen.getByRole("radio", { name: "ACoS" })).toBeChecked();
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });

  it("shows an empty state when no accounts are comparable", () => {
    render(
      <WeeklyRankCard
        mode="week"
        periodLabel="2026W36"
        previousPeriodLabel="2026W35"
        metrics={metrics}
        clients={[
          {
            clientIdCode: "NONE",
            clientName: "None",
            brandName: null,
            accountIds: [],
            logoSrc: null,
            values: { Sales: { current: 10, previous: 8 } },
          },
        ]}
      />,
    );

    expect(
      screen.getByText(/No comparable week-over-week sales/),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sales" })).toBeChecked();
  });

  it("keeps every comparable client on the chart without a horizontal scroller", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      clientIdCode: `C${i + 1}`,
      clientName: `Client ${i + 1}`,
      brandName: `Brand ${i + 1}`,
      accountIds: [`${i + 1}`],
      logoSrc: `/client-logos/C${i + 1}.png`,
      values: {
        Sales: { current: 100 + i, previous: 100 },
        ACoS: { current: 20, previous: 20 },
      },
    }));
    render(
      <WeeklyRankCard
        clients={many}
        metrics={metrics}
        mode="week"
        periodLabel="2026W36"
        previousPeriodLabel="2026W35"
      />,
    );
    expect(screen.getByTestId("weekly-rank-chart-fit")).toHaveAttribute("data-client-count", "12");
    expect(screen.getByTestId("weekly-rank-chart-fit")).not.toHaveAttribute("style");
  });
});
