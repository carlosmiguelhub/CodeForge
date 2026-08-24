import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/manrope";
import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";

export const metadata: Metadata = {
  title: "CodeForge",
  description: "Secure browser-based SQL, code, and ERD practice suite",
};

// Runs before hydration so the correct theme paints on first frame instead
// of flashing dark then switching — localStorage isn't available server-side.
const themeInitScript = `(function () {
  try {
    var stored = window.localStorage.getItem("sqweb-theme");
    document.documentElement.setAttribute(
      "data-theme",
      stored === "light" ? "light" : "dark",
    );
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
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
