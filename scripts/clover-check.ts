import { loadEnvConfig } from "@next/env";
import { createConfiguredCloverClient, getCloverConfiguration } from "../src/lib/server/clover";

loadEnvConfig(process.cwd());

async function main() {
  const configuration = getCloverConfiguration();
  const client = createConfiguredCloverClient();
  const [merchant, items] = await Promise.all([client.getMerchant(), client.listItems(3)]);

  console.log(JSON.stringify({
    ok: true,
    environment: configuration.environment,
    merchant: {
      idSuffix: merchant.id.slice(-4),
      name: merchant.name ?? "Available",
      currency: merchant.currency ?? "Unknown",
    },
    inventoryRead: true,
    sampleItems: items.map((item) => ({
      idSuffix: item.id.slice(-4),
      name: item.name,
      sku: item.sku ?? null,
      quantity: item.itemStock?.quantity ?? null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Clover connection check failed.");
  process.exitCode = 1;
});
