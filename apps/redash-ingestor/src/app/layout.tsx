import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNGUESS Redash Sync",
  description: "Local Docker app to sync Redash JSON into PostgreSQL"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
