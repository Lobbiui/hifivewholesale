import { z } from "zod";

const configurationSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  merchantId: z.string().trim().min(1),
  apiToken: z.string().trim().min(1),
});

export type CloverConfiguration = z.infer<typeof configurationSchema>;

export type CloverMerchant = {
  id: string;
  name?: string;
  currency?: string;
  timezone?: string;
};

export type CloverItem = {
  id: string;
  name: string;
  sku?: string;
  code?: string;
  price?: number;
  itemStock?: { quantity?: number };
};

type CloverElements<T> = {
  elements?: T[];
  href?: string;
};

export class CloverApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CloverApiError";
  }
}

export function getCloverConfiguration(): CloverConfiguration {
  const result = configurationSchema.safeParse({
    environment: process.env.CLOVER_ENVIRONMENT?.trim().toLowerCase(),
    merchantId: process.env.CLOVER_MERCHANT_ID,
    apiToken: process.env.CLOVER_API_TOKEN,
  });

  if (!result.success) {
    throw new Error("Clover is not configured. Set CLOVER_ENVIRONMENT, CLOVER_MERCHANT_ID, and CLOVER_API_TOKEN.");
  }
  return result.data;
}

export class CloverClient {
  private readonly baseUrl: string;

  constructor(private readonly configuration: CloverConfiguration) {
    this.baseUrl = configuration.environment === "sandbox"
      ? "https://apisandbox.dev.clover.com"
      : "https://api.clover.com";
  }

  private async request<ResponseBody>(path: string, init: RequestInit = {}): Promise<ResponseBody> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.configuration.apiToken}`,
        "User-Agent": "Hi-Five-Wholesale/0.1",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new CloverApiError(`Clover request failed with HTTP ${response.status}.`, response.status);
    }
    return response.json() as Promise<ResponseBody>;
  }

  getMerchant() {
    return this.request<CloverMerchant>(`/v3/merchants/${encodeURIComponent(this.configuration.merchantId)}`);
  }

  async listItems(limit = 25) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const response = await this.request<CloverElements<CloverItem>>(
      `/v3/merchants/${encodeURIComponent(this.configuration.merchantId)}/items?limit=${safeLimit}&expand=itemStock`,
    );
    return response.elements ?? [];
  }
}

export function createConfiguredCloverClient() {
  return new CloverClient(getCloverConfiguration());
}
