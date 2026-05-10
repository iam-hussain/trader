import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trader Daily",
  description: "Personal daily trading helper",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
