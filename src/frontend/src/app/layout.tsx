import type { Metadata } from "next";
import { Syne, Manrope, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/providers/app-providers";
import { PerformanceMeasureGuard } from "@/components/dev/performance-measure-guard";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
  ),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${manrope.variable} ${syne.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <PerformanceMeasureGuard />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
