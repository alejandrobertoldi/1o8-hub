import Link from "next/link";
import { HELP_TREE } from "@/lib/help/registry";
import { HelpDocHeader } from "@/components/help/help-doc-header";

export const metadata = { title: "Help & SOPs · 1o8 Hub" };

export default function HelpIndexPage() {
  const totalSops = HELP_TREE.reduce(
    (n, s) => n + s.items.filter((i) => i.slug).length,
    0,
  );

  return (
    <div className="help-doc">
      <HelpDocHeader
        title="Help & SOPs"
        subtitle="1o8 — Internal Reference"
        version={`${totalSops} SOP${totalSops === 1 ? "" : "s"} · explore by section`}
      />
      <div className="container">
        <p className="lead">
          Browse help the same way you navigate the app. Each card below is a
          top-level section from the main menu. Rows tagged{" "}
          <span className="sop-badge">SOP</span> open a guide; the others link to
          that section in the app.
        </p>

        <div className="tree-grid">
          {HELP_TREE.map((section) => {
            const sopCount = section.items.filter((i) => i.slug).length;
            return (
              <div key={section.id} className="tree-card">
                <div className="tree-head">
                  <span className="tree-head-title">
                    <span className="tree-head-icon">{section.icon}</span>
                    {section.label}
                  </span>
                  <span className="tree-head-count">
                    {sopCount
                      ? `${sopCount} SOP${sopCount === 1 ? "" : "s"}`
                      : "—"}
                  </span>
                </div>
                {section.items.map((item) => {
                  const hasSop = Boolean(item.slug);
                  return (
                    <Link
                      key={item.label}
                      href={hasSop ? `/help/${item.slug}` : item.href}
                      className={`tree-node ${hasSop ? "has-sop" : "muted"}`}
                    >
                      <span className="tree-node-dot" />
                      <span className="tree-node-label">{item.label}</span>
                      {hasSop ? (
                        <>
                          <span className="sop-badge">SOP</span>
                          <span className="tree-node-arrow">→</span>
                        </>
                      ) : (
                        <span className="tree-node-path">{item.href}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
