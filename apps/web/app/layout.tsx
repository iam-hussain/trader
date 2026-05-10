import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trader · Daily helper",
  description: "Personal daily US-equities & options trading helper",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
