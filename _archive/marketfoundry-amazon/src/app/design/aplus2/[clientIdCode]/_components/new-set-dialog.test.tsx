import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewSetDialog } from "./new-set-dialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const product = {
  id: "prod-1",
  asin: "B0CWVP6D4N",
  sku: "QP-SYNK-7Y20",
  itemName: "Alcohol-Free Drink",
  summarizedTitle: "Alcohol-Free Drink|Bundle",
  parentAsin: null,
  country: "US",
  marketplace: "US",
  status: "Active",
  parentageLevel: "Parent",
  variationId: "TRS_SC_US_01",
};

const groupMembers = [
  { ...product, id: "prod-1", asin: "B0PARENT001", color: null, size: null, flavor: null, style: null },
  { ...product, id: "prod-2", asin: "B0BLACK0001", parentageLevel: "Child", color: "Black", size: "Small", flavor: null, style: null },
  { ...product, id: "prod-3", asin: "B0BLACK0002", parentageLevel: "Child", color: "Black", size: "Large", flavor: null, style: null },
  { ...product, id: "prod-4", asin: "B0RED000001", parentageLevel: "Child", color: "Red", size: "Large", flavor: null, style: null },
];

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewSetDialog open onOpenChange={() => {}} clientIdCode="TRS_SC_US" />
    </QueryClientProvider>,
  );
}

describe("NewSetDialog Amazon PDP", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).includes("/api/aplus2/variation-members")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              variationId: "TRS_SC_US_01",
              variationName: "Drinks",
              parentAsin: "B0PARENT001",
              themeAttributes: ["Color", "Size"],
              members: groupMembers,
            }),
          });
        }
        if (String(url).includes("/api/aplus2/products")) {
          return Promise.resolve({ ok: true, json: async () => [product] });
        }
        if (String(url).includes("/api/aplus2/sets") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              setId: "set-1",
              versionId: "version-1",
              scopeIdentifier: "G01_Selected_ASINs",
              marketplace: "US",
              contentType: "PA+",
            }),
          });
        }
        if (String(url).includes("/api/aplus2/sets")) {
          return Promise.resolve({ ok: true, json: async () => ({ sets: [] }) });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );
  });

  it("shows an Amazon PDP icon next to each product ASIN", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText("B0CWVP6D4N")).toBeInTheDocument());
    const amazon = screen.getByRole("link", { name: "Open Amazon product page" });
    expect(amazon).toHaveAttribute("href", "https://www.amazon.com/dp/B0CWVP6D4N");
    expect(amazon).toHaveAttribute("target", "_blank");
  });

  it("filters a GROUP and posts the checked visible ASINs", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes("/api/aplus2/variation-members")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            variationId: "TRS_SC_US_01",
            variationName: "Drinks",
            parentAsin: "B0PARENT001",
            themeAttributes: ["Color", "Size"],
            members: groupMembers,
          }),
        });
      }
      if (String(url).includes("/api/aplus2/products")) {
        return Promise.resolve({ ok: true, json: async () => [product] });
      }
      if (String(url).includes("/api/aplus2/sets") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            setId: "set-1",
            versionId: "version-1",
            scopeIdentifier: "TRS_SC_US_01_G01",
            marketplace: "US",
            contentType: "PA+",
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ sets: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "GROUP" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Color" })).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Color" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Black" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    const firstMemberCheckbox = screen.getByRole("checkbox", { name: "Include B0BLACK0001" });
    const firstMemberLink = screen.getByRole("link", { name: "B0BLACK0001" });
    expect(firstMemberLink).toHaveAttribute("href", "/products/prod-2?from=aplus");
    fireEvent.click(firstMemberLink);
    expect(firstMemberCheckbox).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select visible ASINs" }));
    fireEvent.click(screen.getByRole("button", { name: "Create set" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.[1]?.body));
      expect(body).toMatchObject({
        scopeType: "GROUP",
        groupName: "Black",
        coveredAsins: ["B0BLACK0001", "B0BLACK0002"],
      });
    });
  });

  it("keeps selected ASINs while browsing another variation", async () => {
    const secondParent = {
      ...product,
      id: "parent-2",
      asin: "B0PARENT002",
      variationId: "TRS_SC_US_02",
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/api/aplus2/variation-members")) {
        const second = href.includes("TRS_SC_US_02");
        return Promise.resolve({
          ok: true,
          json: async () => ({
            variationId: second ? "TRS_SC_US_02" : "TRS_SC_US_01",
            variationName: second ? "Second variation" : "First variation",
            parentAsin: second ? "B0PARENT002" : "B0PARENT001",
            themeAttributes: [],
            members: [{
              ...product,
              id: second ? "child-2" : "child-1",
              asin: second ? "B0VAR2CHILD" : "B0VAR1CHILD",
              parentageLevel: "Child",
              color: null,
              size: null,
              flavor: null,
              style: null,
            }],
          }),
        });
      }
      if (href.includes("/api/aplus2/products")) {
        return Promise.resolve({ ok: true, json: async () => [product, secondParent] });
      }
      if (href.includes("/api/aplus2/sets") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            setId: "set-1",
            versionId: "version-1",
            scopeIdentifier: "TRS_SC_US_02_G01",
            marketplace: "US",
            contentType: "PA+",
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ sets: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "GROUP" }));
    fireEvent.click(screen.getByRole("button", { name: "One variation" }));
    await waitFor(() => expect(screen.getByText("B0CWVP6D4N")).toBeInTheDocument());
    fireEvent.click(screen.getByText("B0CWVP6D4N").closest('[role="option"]')!);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Include B0VAR1CHILD" }));

    fireEvent.click(screen.getByText("B0PARENT002").closest('[role="option"]')!);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Include B0VAR2CHILD" }));
    expect(screen.getByText("2 selected", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create set" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      const body = JSON.parse(String(post?.[1]?.body));
      expect(body.coveredAsins).toEqual(["B0VAR1CHILD", "B0VAR2CHILD"]);
    });
  });

  it("can browse and filter members across all client variations", async () => {
    const fetchMock = vi.mocked(fetch);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "GROUP" }));
    await screen.findByRole("button", { name: "All variations" });
    expect(screen.queryByText("Search parent ASINs")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All variations" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => {
        const href = String(url);
        return href.includes("/api/aplus2/variation-members")
          && !href.includes("variationId=");
      })).toBe(true);
    });
    expect(screen.getByRole("button", { name: "Color" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Include B0BLACK0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include B0BLACK0002" }));
    fireEvent.click(screen.getByRole("button", { name: "Create set" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      const body = JSON.parse(String(post?.[1]?.body));
      expect(body).toMatchObject({
        productId: "prod-2",
        groupName: "Selected_ASINs",
        coveredAsins: ["B0BLACK0001", "B0BLACK0002"],
      });
    });
  });
});
