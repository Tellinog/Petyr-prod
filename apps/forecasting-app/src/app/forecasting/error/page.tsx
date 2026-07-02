import { PetyrErrorPage } from "@/components/petyr/PetyrErrorPage";

type ForecastingErrorPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveErrorCopy(code: string | undefined) {
  if (code === "400") {
    return {
      statusCode: "400",
      title: "Bad request",
      description:
        "Petyr could not use the request that reached the Forecasting workspace. Return to Forecasting and start again from a clean page."
    };
  }

  return {
    statusCode: "500",
    title: "Unexpected error",
    description:
      "Petyr could not complete this browser flow. Return to Forecasting and start again from the main workspace."
  };
}

export default async function ForecastingErrorPage({ searchParams }: ForecastingErrorPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const copy = resolveErrorCopy(firstParam(resolvedSearchParams.code)?.trim());

  return <PetyrErrorPage {...copy} />;
}
