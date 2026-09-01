import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "shared-docs",
  description: "Create, import and share rich-text documents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh antialiased">
        {children}
        {/* Pinned to light: 04 §11 ships no dark mode, and sonner's default `theme="system"`
            would paint dark toasts over a permanently light app on any machine whose OS
            prefers dark. */}
        <Toaster theme="light" />
      </body>
    </html>
  );
}
