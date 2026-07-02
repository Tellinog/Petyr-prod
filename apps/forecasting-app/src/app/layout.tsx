import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petyr · UNGUESS Forecasting",
  description: "UNGUESS forecasting workspace powered by Redash data snapshots."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
