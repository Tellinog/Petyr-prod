"use client";

import { PetyrErrorPage } from "@/components/petyr/PetyrErrorPage";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <PetyrErrorPage
      statusCode="500"
      title="Something went wrong"
      description="Petyr could not complete this request. You can retry the page or return to the Forecasting workspace."
      details={error.digest ? `Error reference: ${error.digest}` : undefined}
      actions={[
        { label: "Try again", onClick: reset },
        { label: "Back to Forecasting", href: "/forecasting", variant: "secondary" }
      ]}
    />
  );
}
