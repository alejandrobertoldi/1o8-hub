import { act, render, renderHook, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { useGeographyStockMonth } from "./use-geography-stock-month";
import type { StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";

describe("useGeographyStockMonth", () => {
  it("a URL month survives the empty account while clients load, and binds to the first real account", () => {
    const { result, rerender } = renderHook(({ id }) => useGeographyStockMonth(id, "2026-07"), { initialProps: { id: "" } });
    expect(result.current.month).toBe("2026-07");
    rerender({ id: "A" });
    expect(result.current.month).toBe("2026-07");
    rerender({ id: "B" });
    expect(result.current.month).toBeNull();
  });

  it("a pick is keyed to its account: switching away drops it in the same render", () => {
    const { result, rerender } = renderHook(({ id }) => useGeographyStockMonth(id, null), { initialProps: { id: "A" } });
    act(() => result.current.pickMonth("2026-06"));
    expect(result.current.month).toBe("2026-06");
    rerender({ id: "B" });
    expect(result.current.month).toBeNull();
  });

  it("a month the account does not have is treated as newest (null) once months are known", () => {
    const { result } = renderHook(() => useGeographyStockMonth("A", "2026-07"));
    act(() => result.current.onStockMonths({ months: ["2026-08", "2026-06"], month: "2026-08" }));
    expect(result.current.month).toBeNull();
  });

  it("months reported by a child effect on an account switch are tagged with the NEW account", () => {
    function Child({ id, report }: { id: string; report: (m: StockMonths) => void }) {
      useEffect(() => report({ months: [`${id}-m`], month: `${id}-m` }), [id, report]);
      return null;
    }
    function H({ id }: { id: string }) {
      const g = useGeographyStockMonth(id, null);
      return <><Child id={id} report={g.onStockMonths} /><div data-testid="o">{g.stockMonths?.month ?? "none"}</div></>;
    }
    const { rerender } = render(<H id="A" />);
    expect(screen.getByTestId("o")).toHaveTextContent("A-m");
    rerender(<H id="B" />);
    expect(screen.getByTestId("o")).toHaveTextContent("B-m");
  });
});
