import type { Metadata } from "next";
import "./globals.css";

// Bare shell. T06 owns the final layout (fonts, theme, chrome).
export const metadata: Metadata = {
  title: "shared-docs",
  description: "Create, import and share rich-text documents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
