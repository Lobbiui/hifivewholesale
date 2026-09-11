import { AdminActivation } from "@/components/admin-activation";

export default async function AdminActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <AdminActivation token={token} />;
}
