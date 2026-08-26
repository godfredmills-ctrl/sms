import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentChannel, PaymentProvider, PaymentStatus } from "@prisma/client";

import { generateCode } from "@/lib/crypto";
import { env } from "@/lib/env";
import { integrationConfig, type ResolvedPayments } from "@/lib/integrations/config";
import { normalisePhone } from "@/lib/utils";

/**
 * Payment provider abstraction.
 *
 * Paystack is the default for Ghana: one integration covers mobile money
 * (MTN, Telecel, AirtelTigo), cards, bank transfer and USSD. Hubtel is
 * supported as an alternative, and a mock provider lets the whole fee flow be
 * demonstrated and tested with no merchant account.
 */

export type CheckoutRequest = {
  /** Amount in minor units (pesewas). */
  amountMinor: number;
  currency: string;
  email: string;
  phone?: string | null;
  /** Our own reference — becomes the reconciliation key. */
  reference: string;
  callbackUrl: string;
  channels?: PaymentChannel[];
  metadata?: Record<string, unknown>;
};

export type CheckoutResponse = {
  ok: boolean;
  /** URL to redirect the payer to, when the provider hosts the checkout. */
  authorizationUrl?: string;
  providerReference?: string;
  /** USSD string the payer can dial, when the provider returns one. */
  ussdCode?: string;
  error?: string;
};

export type VerificationResult = {
  ok: boolean;
  status: PaymentStatus;
  amountMinor?: number;
  currency?: string;
  channel?: PaymentChannel;
  providerReference?: string;
  paidAt?: Date;
  feeMinor?: number;
  payerName?: string | null;
  momoNetwork?: string | null;
  momoNumber?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  bankName?: string | null;
  raw?: unknown;
  error?: string;
};

export type WebhookEvent = {
  ok: boolean;
  reference?: string;
  result?: VerificationResult;
  error?: string;
};

export interface PaymentGateway {
  readonly id: PaymentProvider;
  readonly label: string;
  /** Channels this gateway can actually process. */
  readonly channels: PaymentChannel[];
  initiate(request: CheckoutRequest): Promise<CheckoutResponse>;
  verify(reference: string): Promise<VerificationResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent>;
}

// -----------------------------------------------------------------------------
// Paystack
// -----------------------------------------------------------------------------

const PAYSTACK_BASE = "https://api.paystack.co";

/** Our channel names -> Paystack's. */
const PAYSTACK_CHANNELS: Partial<Record<PaymentChannel, string>> = {
  MOBILE_MONEY: "mobile_money",
  CARD: "card",
  BANK_TRANSFER: "bank_transfer",
  USSD: "ussd",
  POS: "pos",
};

function paystackChannelToOurs(channel: string | undefined): PaymentChannel {
  switch (channel) {
    case "mobile_money":
    case "mobile_money_ghana":
      return "MOBILE_MONEY";
    case "card":
      return "CARD";
    case "bank":
    case "bank_transfer":
      return "BANK_TRANSFER";
    case "ussd":
      return "USSD";
    case "pos":
      return "POS";
    default:
      return "CARD";
  }
}

class PaystackGateway implements PaymentGateway {
  readonly id = "PAYSTACK" as const;
  readonly label = "Paystack";
  readonly channels: PaymentChannel[] = [
    "MOBILE_MONEY",
    "CARD",
    "BANK_TRANSFER",
    "USSD",
  ];

  constructor(private readonly config: ResolvedPayments) {}

  private get secret() {
    return this.config.paystackSecret;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; data?: T; message?: string }> {
    const response = await fetch(`${PAYSTACK_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: T;
    };

    if (!response.ok || body.status === false) {
      return { ok: false, message: body.message ?? `Paystack returned ${response.status}` };
    }
    return { ok: true, data: body.data };
  }

  async initiate(request: CheckoutRequest): Promise<CheckoutResponse> {
    if (!this.secret) {
      return { ok: false, error: "Paystack secret key is not configured." };
    }

    const channels = (request.channels ?? this.channels)
      .map((channel) => PAYSTACK_CHANNELS[channel])
      .filter((value): value is string => Boolean(value));

    const result = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        // Paystack takes the smallest currency unit, which is what we store.
        amount: request.amountMinor,
        currency: request.currency,
        email: request.email,
        reference: request.reference,
        callback_url: request.callbackUrl,
        channels: channels.length ? channels : undefined,
        metadata: {
          ...request.metadata,
          phone: normalisePhone(request.phone) ?? undefined,
        },
      }),
    });

    if (!result.ok || !result.data) {
      return { ok: false, error: result.message };
    }

    return {
      ok: true,
      authorizationUrl: result.data.authorization_url,
      providerReference: result.data.reference,
    };
  }

  async verify(reference: string): Promise<VerificationResult> {
    if (!this.secret) {
      return { ok: false, status: "PENDING", error: "Paystack is not configured." };
    }

    const result = await this.request<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );

    if (!result.ok || !result.data) {
      return { ok: false, status: "PENDING", error: result.message };
    }

    return mapPaystackTransaction(result.data);
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent> {
    if (!this.secret) return { ok: false, error: "Paystack is not configured." };
    if (!signature) return { ok: false, error: "Missing signature header." };

    // Paystack signs the raw body with HMAC SHA-512 using the secret key.
    const expected = createHmac("sha512", this.secret).update(rawBody).digest("hex");
    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");

    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      return { ok: false, error: "Signature mismatch." };
    }

    const payload = JSON.parse(rawBody) as {
      event: string;
      data: PaystackTransaction;
    };

    if (!payload.event?.startsWith("charge.")) {
      // Transfers, subscriptions etc. are not part of fee collection.
      return { ok: true };
    }

    return {
      ok: true,
      reference: payload.data.reference,
      result: mapPaystackTransaction(payload.data),
    };
  }
}

type PaystackTransaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string;
  fees?: number;
  gateway_response?: string;
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  authorization?: {
    last4?: string;
    brand?: string;
    bank?: string;
    mobile_money_number?: string;
    channel?: string;
  };
  metadata?: Record<string, unknown>;
};

function mapPaystackTransaction(data: PaystackTransaction): VerificationResult {
  const status: PaymentStatus =
    data.status === "success"
      ? "SUCCESS"
      : data.status === "failed"
        ? "FAILED"
        : data.status === "abandoned"
          ? "CANCELLED"
          : "PENDING";

  const channel = paystackChannelToOurs(data.channel);

  return {
    ok: true,
    status,
    amountMinor: data.amount,
    currency: data.currency,
    channel,
    providerReference: data.reference,
    paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
    feeMinor: data.fees ?? 0,
    payerName:
      [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(" ") || null,
    momoNetwork:
      channel === "MOBILE_MONEY" ? (data.authorization?.bank ?? null) : null,
    momoNumber: data.authorization?.mobile_money_number ?? null,
    cardLast4: channel === "CARD" ? (data.authorization?.last4 ?? null) : null,
    cardBrand: channel === "CARD" ? (data.authorization?.brand ?? null) : null,
    bankName: data.authorization?.bank ?? null,
    raw: data,
  };
}

// -----------------------------------------------------------------------------
// Hubtel
// -----------------------------------------------------------------------------

class HubtelGateway implements PaymentGateway {
  readonly id = "HUBTEL" as const;
  readonly label = "Hubtel";
  readonly channels: PaymentChannel[] = ["MOBILE_MONEY", "CARD", "BANK_TRANSFER"];

  constructor(private readonly config: ResolvedPayments) {}

  private get auth() {
    const { hubtelClientId, hubtelClientSecret } = this.config;
    if (!hubtelClientId || !hubtelClientSecret) return null;
    return Buffer.from(`${hubtelClientId}:${hubtelClientSecret}`).toString("base64");
  }

  async initiate(request: CheckoutRequest): Promise<CheckoutResponse> {
    const auth = this.auth;
    if (!auth || !this.config.hubtelMerchant) {
      return { ok: false, error: "Hubtel credentials are not configured." };
    }

    try {
      const response = await fetch("https://payproxyapi.hubtel.com/items/initiate", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          totalAmount: request.amountMinor / 100,
          description: `School fees, ${request.reference}`,
          // These are two different things and were being sent the same value.
          //
          // returnUrl is where the payer's browser is sent afterwards;
          // callbackUrl is where Hubtel POSTs its server-to-server
          // confirmation. Pointing both at the guardian's fees page meant the
          // confirmation was posted to a React page, which answers 405 — so
          // this file's own Hubtel webhook parser could never run at all. A
          // parent who approved the mobile money prompt on their phone and
          // never returned to the browser left the school holding the money
          // with the invoice fully outstanding.
          callbackUrl: `${env.appUrl}/api/webhooks/payments`,
          returnUrl: request.callbackUrl,
          merchantAccountNumber: this.config.hubtelMerchant,
          clientReference: request.reference,
        }),
        cache: "no-store",
      });

      const body = (await response.json()) as {
        status?: string;
        data?: { checkoutUrl?: string; checkoutId?: string };
        message?: string;
      };

      if (!response.ok || !body.data?.checkoutUrl) {
        return { ok: false, error: body.message ?? "Hubtel rejected the request." };
      }

      return {
        ok: true,
        authorizationUrl: body.data.checkoutUrl,
        providerReference: body.data.checkoutId,
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  async verify(reference: string): Promise<VerificationResult> {
    const auth = this.auth;
    if (!auth) return { ok: false, status: "PENDING", error: "Hubtel is not configured." };

    try {
      const response = await fetch(
        `https://api-txnstatus.hubtel.com/transactions/${this.config.hubtelMerchant}/status?clientReference=${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
      );
      const body = (await response.json()) as {
        data?: { status?: string; amount?: number; clientReference?: string };
      };

      const raw = body.data?.status?.toLowerCase();
      return {
        ok: true,
        status: raw === "paid" ? "SUCCESS" : raw === "failed" ? "FAILED" : "PENDING",
        amountMinor: body.data?.amount ? Math.round(body.data.amount * 100) : undefined,
        providerReference: body.data?.clientReference,
        channel: "MOBILE_MONEY",
        raw: body,
      };
    } catch (error) {
      return { ok: false, status: "PENDING", error: (error as Error).message };
    }
  }

  async parseWebhook(rawBody: string): Promise<WebhookEvent> {
    try {
      const payload = JSON.parse(rawBody) as {
        Data?: { ClientReference?: string; Status?: string; Amount?: number };
      };
      const reference = payload.Data?.ClientReference;
      if (!reference) return { ok: false, error: "Missing client reference." };

      // Hubtel does not sign callbacks, so the payload is treated as a hint
      // only and confirmed with a status lookup before any money is recorded.
      return { ok: true, reference, result: await this.verify(reference) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}

// -----------------------------------------------------------------------------
// Mock — development and demonstrations
// -----------------------------------------------------------------------------

class MockGateway implements PaymentGateway {
  readonly id = "MOCK" as const;
  readonly label = "Test gateway";
  readonly channels: PaymentChannel[] = [
    "MOBILE_MONEY",
    "CARD",
    "BANK_TRANSFER",
    "USSD",
  ];

  async initiate(request: CheckoutRequest): Promise<CheckoutResponse> {
    // Routes to an in-app page that simulates the provider's checkout.
    const url = new URL("/pay/mock", env.appUrl);
    url.searchParams.set("reference", request.reference);
    url.searchParams.set("amount", String(request.amountMinor));
    return {
      ok: true,
      authorizationUrl: url.toString(),
      providerReference: `MOCK-${generateCode(10)}`,
      ussdCode: `*789*${Math.abs(hashCode(request.reference)) % 100000}#`,
    };
  }

  async verify(reference: string): Promise<VerificationResult> {
    return {
      ok: true,
      status: "SUCCESS",
      providerReference: reference,
      channel: "MOBILE_MONEY",
      paidAt: new Date(),
      feeMinor: 0,
      momoNetwork: "MTN",
    };
  }

  async parseWebhook(rawBody: string): Promise<WebhookEvent> {
    const payload = JSON.parse(rawBody) as { reference?: string };
    if (!payload.reference) return { ok: false, error: "Missing reference." };
    return {
      ok: true,
      reference: payload.reference,
      result: await this.verify(payload.reference),
    };
  }
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/**
 * Gateways are built per call rather than held in a module-level map.
 *
 * They carry the credentials they were built with, and a school can change
 * those from the settings screen — a map built once at import would keep
 * charging against a Paystack key that was replaced an hour ago, with nothing
 * on screen to say so. Construction is a few object allocations; nothing here
 * holds a connection.
 */
export async function getGateway(name?: string): Promise<PaymentGateway> {
  const { payments } = await integrationConfig();
  const key = (name ?? payments.provider).toLowerCase();

  switch (key) {
    case "paystack":
      return new PaystackGateway(payments);
    case "hubtel":
      return new HubtelGateway(payments);
    default:
      return new MockGateway();
  }
}

export async function isLiveGateway(): Promise<boolean> {
  return (await getGateway()).id !== "MOCK";
}

/** Human-readable labels for the channel picker in the portals. */
export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  MOBILE_MONEY: "Mobile Money",
  CARD: "Debit / Credit Card",
  BANK_TRANSFER: "Bank Transfer",
  USSD: "USSD",
  CASH: "Cash",
  CHEQUE: "Cheque",
  POS: "POS Terminal",
  WALLET: "Wallet",
  SCHOLARSHIP: "Scholarship / Waiver",
};

/** Channels a guardian can pick in the portal (excludes back-office methods). */
export async function onlineChannels(): Promise<PaymentChannel[]> {
  return (await getGateway()).channels;
}

/** Channels the bursar can record manually at the front desk. */
export const OFFLINE_CHANNELS: PaymentChannel[] = [
  "CASH",
  "CHEQUE",
  "BANK_TRANSFER",
  "POS",
  "MOBILE_MONEY",
  "SCHOLARSHIP",
];

export const MOMO_NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
