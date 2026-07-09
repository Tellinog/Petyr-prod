import type { Metadata } from "next";
import PetyrFeedbackButton from "@/components/petyr/PetyrFeedbackButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petyr · UNGUESS Forecasting",
  description: "UNGUESS forecasting workspace powered by Redash data snapshots."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PetyrFeedbackButton />
      </body>
    </html>
  );
}
