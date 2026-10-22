import "@/styles/help-doc.css";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1000px] py-2">{children}</div>;
}
