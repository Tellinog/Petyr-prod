import type { Metadata } from "next";
import PetyrFeedbackButton from "@/components/petyr/PetyrFeedbackButton";
import { getPetyrAuthIdentity } from "@/lib/petyr/auth";
import { canManagePetyrFeedback } from "@/lib/petyr/authCore";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petyr · UNGUESS Forecasting",
  description: "UNGUESS forecasting workspace powered by Redash data snapshots."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await getPetyrAuthIdentity();
  const canReviewFeedback = auth.ok && canManagePetyrFeedback(auth.identity);

  return (
    <html lang="en">
      <body>
        {children}
        <PetyrFeedbackButton canReviewFeedback={canReviewFeedback} />
      </body>
    </html>
  );
}
