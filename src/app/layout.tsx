import type { Metadata, Viewport } from "next";

import { PwaRuntime } from "@/components/pwa";
import { getCurrentUser } from "@/lib/auth";

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
  // Single colour: the interface is light regardless of the OS setting, so a
  // dark variant here would only mismatch the page it frames.
  themeColor: "#128257",
};

/**
 * Applied before first paint so a user who explicitly chose dark never sees a
 * flash of light first. With nothing stored, no attribute is set and the
 * light palette on bare `:root` applies — the OS setting is not consulted.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Only used to decide whether to offer push enrolment. Nothing about the user
  // is rendered here, so this stays a cheap session lookup rather than a reason
  // to make the whole tree dynamic.
  const signedIn = Boolean(await getCurrentUser());

  return (
    <html lang="en-GH" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRuntime signedIn={signedIn} />
      </body>
    </html>
  );
}
