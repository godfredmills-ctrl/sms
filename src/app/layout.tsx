import type { Metadata, Viewport } from "next";

import { PwaRuntime } from "@/components/pwa";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "School Management System",
    template: "%s · School Management System",
  },
  description:
    "Student records, attendance, assessment, fees, communication and learning — one system for the whole school.",
  applicationName: "School MS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "School MS",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#128257" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

/**
 * Applied before first paint so a user who chose dark mode never sees a flash
 * of the light theme.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GH" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
