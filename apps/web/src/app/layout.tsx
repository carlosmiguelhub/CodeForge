import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/manrope";
import "./globals.css";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";

export const metadata: Metadata = {
  applicationName: "CodeForge",
  title: "CodeForge",
  description: "Secure browser-based SQL, code, and ERD practice suite",
  appleWebApp: {
    capable: true,
    title: "CodeForge",
    statusBarStyle: "black",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#070708",
};

// Runs before hydration so the correct theme paints on first frame instead
// of flashing dark then switching — localStorage isn't available server-side.
const themeInitScript = `(function () {
  try {
    var stored = window.localStorage.getItem("sqweb-theme");
    var theme = stored === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute(
        "content",
        theme === "light" ? "#f4f5f7" : "#070708",
      );
    }
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV !== "production"}
          cacheOnNavigation={false}
          reloadOnOnline={false}
        >
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
