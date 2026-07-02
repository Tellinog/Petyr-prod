import { PetyrErrorPage } from "@/components/petyr/PetyrErrorPage";

export default function NotFoundPage() {
  return (
    <PetyrErrorPage
      statusCode="404"
      title="Page not found"
      description="The Petyr page you are looking for does not exist or is no longer available."
    />
  );
}
