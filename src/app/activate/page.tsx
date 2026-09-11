import { BuyerActivation } from "@/components/buyer-activation";

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <BuyerActivation token={token} />;
}
