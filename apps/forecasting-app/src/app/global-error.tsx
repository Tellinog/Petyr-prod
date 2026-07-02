"use client";

import { PetyrErrorPage } from "@/components/petyr/PetyrErrorPage";
import "./globals.css";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body>
        <PetyrErrorPage
          statusCode="500"
          title="Petyr needs a reload"
          description="The Forecasting workspace hit an unexpected application error before the page could load."
          details={error.digest ? `Error reference: ${error.digest}` : undefined}
          actions={[
            { label: "Try again", onClick: reset },
            { label: "Back to Forecasting", href: "/forecasting", variant: "secondary" }
          ]}
        />
      </body>
    </html>
  );
}
