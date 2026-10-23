import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LayoutRouter } from "@/components/layout/layout-router";
import { Toaster } from "@/components/ui/sonner";
import { VersionBadge } from "@/components/layout/version-badge";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 1o8 brand typeface (docs/brand/1O8-BRAND.md): Inter 400/700/800.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "1o8 Hub",
  description: "Internal operations hub for 1o8 Agency",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-icon.png",
  },
  // Link previews (Slack, WhatsApp, iMessage…) show the 1o8 mark, not a generic icon.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3108",
  ),
  openGraph: {
    title: "1o8 Hub",
    description: "Internal operations hub for 1o8 Agency",
    siteName: "1o8 Hub",
    images: [{ url: "/favicon.png", width: 256, height: 256, alt: "1o8" }],
  },
  twitter: { card: "summary", title: "1o8 Hub", images: ["/favicon.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased relative isolate" suppressHydrationWarning>
        <ThemeProvider>
          <SessionProvider>
            <QueryProvider>
              <LayoutRouter>{children}</LayoutRouter>
              <Toaster />
              <VersionBadge />
            </QueryProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
