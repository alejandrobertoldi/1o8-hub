import { describe, it, expect } from "vitest";
import { absolutizeRootUrls, buildStandaloneReportHtml } from "./html-archive";

describe("absolutizeRootUrls", () => {
  it("prefixes root-relative src and href with the origin", () => {
    const html = `<img src="/MF_Logo_Orange.png"><a href="/client-logos/POO.png">x</a>`;
    expect(absolutizeRootUrls(html, "https://www.marketfoundryhub.com")).toBe(
      `<img src="https://www.marketfoundryhub.com/MF_Logo_Orange.png"><a href="https://www.marketfoundryhub.com/client-logos/POO.png">x</a>`,
    );
  });

  it("leaves hashes and already-absolute URLs alone", () => {
    const html = `<a href="#cover"></a><img src="https://cdn.example/a.png">`;
    expect(absolutizeRootUrls(html, "http://localhost:3000/")).toBe(html);
  });
});

describe("buildStandaloneReportHtml", () => {
  it("wraps the report body with title, Outfit, and inlined CSS", () => {
    const html = buildStandaloneReportHtml({
      title: "Poochie Butter · July 2026",
      origin: "http://localhost:3000",
      bodyHtml: `<div class="report-doc"><img src="/MF_Logo_Orange.png" alt="1o8"></div>`,
      css: ".cover{color:red}",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Poochie Butter · July 2026</title>");
    expect(html).toContain("family=Outfit");
    expect(html).toContain(".cover{color:red}");
    expect(html).toContain("http://localhost:3000/MF_Logo_Orange.png");
    expect(html).toContain("--mf-orange:#F7BF1D");
  });

  it("escapes the title", () => {
    const html = buildStandaloneReportHtml({
      title: `A <script>alert("x")</script>`,
      origin: "http://localhost:3000",
      bodyHtml: "<div></div>",
      css: "",
    });
    expect(html).toContain("<title>A &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</title>");
    expect(html).not.toContain("<script>alert");
  });
});
