import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Aplus2VersionStatusSelect } from "./aplus2-version-status-select";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderSelect(readOnly: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Aplus2VersionStatusSelect
        versionId="v1"
        value="live"
        setId="s1"
        clientIdCode="TRT_SC_US"
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  );
}

describe("Aplus2VersionStatusSelect", () => {
  it("renders a combobox in hub mode", () => {
    renderSelect(false);
    expect(screen.getByRole("combobox", { name: "Version status" })).toBeInTheDocument();
  });

  it("renders a static chip in portal read-only mode", () => {
    renderSelect(true);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});
