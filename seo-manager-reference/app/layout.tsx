import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1o8 SEO Manager",
  description: "Amazon Listing Optimization — RUFUS & COSMO AI System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-200 antialiased">
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
