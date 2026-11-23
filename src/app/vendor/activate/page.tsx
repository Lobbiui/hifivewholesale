import { VendorActivation } from "@/components/vendor-activation";

export default async function VendorActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <VendorActivation token={token}/>;
}
