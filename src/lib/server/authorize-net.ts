type AuthorizeNetEnvironment = "sandbox" | "production";

type GatewayMessage = {
  code?: string;
  text?: string;
  description?: string;
  errorCode?: string;
  errorText?: string;
};
type GatewayResponse = {
  messages?: { resultCode?: string; message?: GatewayMessage | GatewayMessage[] };
  transactionResponse?: {
    responseCode?: string;
    transId?: string;
    authCode?: string;
    accountNumber?: string;
    accountType?: string;
    messages?: { message?: GatewayMessage | GatewayMessage[] };
    errors?: { error?: GatewayMessage | GatewayMessage[] };
  };
};

export type AuthorizeNetResult = {
  status: "APPROVED" | "DECLINED" | "HELD" | "ERROR";
  transactionId: string | null;
  responseCode: string | null;
  reasonCode: string | null;
  message: string;
  authorizationCode: string | null;
  accountType: string | null;
  maskedAccountNumber: string | null;
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && !/^your[_ -]/i.test(trimmed) ? trimmed : "";
}

export function getAuthorizeNetConfig() {
  const environment: AuthorizeNetEnvironment =
    clean(process.env.AUTHORIZE_NET_ENVIRONMENT)?.toLowerCase() === "production"
      ? "production"
      : "sandbox";
  const apiLoginId = clean(process.env.AUTHORIZE_NET_API_LOGIN_ID);
  const transactionKey = clean(process.env.AUTHORIZE_NET_TRANSACTION_KEY);
  const publicClientKey = clean(process.env.AUTHORIZE_NET_PUBLIC_CLIENT_KEY);
  const configured = Boolean(apiLoginId && transactionKey && publicClientKey);
  return {
    environment,
    apiLoginId,
    transactionKey,
    publicClientKey,
    configured,
    enabled: configured && process.env.AUTHORIZE_NET_ENABLED === "true",
    apiUrl:
      environment === "production"
        ? "https://api.authorize.net/xml/v1/request.api"
        : "https://apitest.authorize.net/xml/v1/request.api",
    scriptUrl:
      environment === "production"
        ? "https://js.authorize.net/v3/AcceptUI.js"
        : "https://jstest.authorize.net/v3/AcceptUI.js",
  };
}

function asMessages(value: GatewayMessage | GatewayMessage[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function parseGatewayResponse(raw: Record<string, unknown>): AuthorizeNetResult {
  const root = (raw.createTransactionResponse ?? raw) as GatewayResponse;
  const transaction = root.transactionResponse;
  const responseCode = transaction?.responseCode ?? null;
  const transactionMessages = [
    ...asMessages(transaction?.errors?.error),
    ...asMessages(transaction?.messages?.message),
    ...asMessages(root.messages?.message),
  ];
  const first = transactionMessages[0];
  const status =
    responseCode === "1"
      ? "APPROVED"
      : responseCode === "2"
        ? "DECLINED"
        : responseCode === "4"
          ? "HELD"
          : "ERROR";
  return {
    status,
    transactionId:
      transaction?.transId && transaction.transId !== "0"
        ? transaction.transId
        : null,
    responseCode,
    reasonCode: first?.code ?? first?.errorCode ?? null,
    message:
      first?.errorText ??
      first?.description ??
      first?.text ??
      (status === "APPROVED"
        ? "Payment approved."
        : "Authorize.net could not process the transaction."),
    authorizationCode: transaction?.authCode ?? null,
    accountType: transaction?.accountType ?? null,
    maskedAccountNumber: transaction?.accountNumber ?? null,
  };
}

async function authorizeNetRequest(payload: Record<string, unknown>) {
  const config = getAuthorizeNetConfig();
  if (!config.configured) throw new Error("Authorize.net is not configured.");
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Authorize.net is temporarily unavailable.");
  return (await response.json()) as Record<string, unknown>;
}

function merchantAuthentication() {
  const config = getAuthorizeNetConfig();
  return { name: config.apiLoginId, transactionKey: config.transactionKey };
}

export async function chargeAuthorizeNet(input: {
  amountCents: number;
  dataDescriptor: string;
  dataValue: string;
  orderNumber: string;
  description: string;
  purchaseOrder: string;
  customerId: string;
  customerEmail: string;
}) {
  const raw = await authorizeNetRequest({
    createTransactionRequest: {
      merchantAuthentication: merchantAuthentication(),
      refId: input.orderNumber.slice(0, 20),
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: (input.amountCents / 100).toFixed(2),
        payment: {
          opaqueData: {
            dataDescriptor: input.dataDescriptor,
            dataValue: input.dataValue,
          },
        },
        order: {
          invoiceNumber: input.orderNumber.slice(0, 20),
          description: input.description.slice(0, 255),
        },
        ...(input.purchaseOrder
          ? { poNumber: input.purchaseOrder.slice(0, 25) }
          : {}),
        customer: {
          type: "business",
          id: input.customerId.slice(0, 20),
          email: input.customerEmail.slice(0, 255),
        },
        transactionSettings: {
          setting: [
            { settingName: "duplicateWindow", settingValue: "300" },
            { settingName: "emailCustomer", settingValue: "false" },
          ],
        },
        authorizationIndicatorType: { authorizationIndicator: "final" },
      },
    },
  });
  return parseGatewayResponse(raw);
}
export async function voidAuthorizeNet(transactionId: string) {
  const raw = await authorizeNetRequest({
    createTransactionRequest: {
      merchantAuthentication: merchantAuthentication(),
      transactionRequest: {
        transactionType: "voidTransaction",
        refTransId: transactionId,
      },
    },
  });
  return parseGatewayResponse(raw);
}

export async function refundAuthorizeNet(
  transactionId: string,
  amountCents: number,
) {
  const raw = await authorizeNetRequest({
    createTransactionRequest: {
      merchantAuthentication: merchantAuthentication(),
      transactionRequest: {
        transactionType: "refundTransaction",
        amount: (amountCents / 100).toFixed(2),
        refTransId: transactionId,
      },
    },
  });
  return parseGatewayResponse(raw);
}

