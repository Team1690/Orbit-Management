import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Orbit Management", template: "%s · Orbit Management" },
  description: "Attendance, hours, RSVPs and member profiles for the team.",
  applicationName: "Orbit",
  appleWebApp: { capable: true, title: "Orbit", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#2450e6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script adds "dark" to <html> before React loads.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
