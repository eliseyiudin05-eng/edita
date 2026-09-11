import { randomUUID } from "crypto";

export type EditaProduct = "start" | "ai-pro-30";

export const PRODUCTS: Record<EditaProduct, { name: string; amount: string; access: string }> = {
  "start": {
    name: "EDITA Start",
    amount: "1490.00",
    access: "Стартовая программа, практика и портфолио",
  },
  "ai-pro-30": {
    name: "EDITA AI PRO — 30 дней",
    amount: "499.00",
    access: "AI Coach, AI Video Review и расширенная аналитика на 30 дней",
  },
};

export function getYooKassaConfig() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return null;
  return { shopId, secretKey };
}

function authHeader(shopId: string, secretKey: string) {
  return "Basic " + Buffer.from(shopId + ":" + secretKey).toString("base64");
}

export async function yookassaRequest(path: string, init: RequestInit = {}) {
  const config = getYooKassaConfig();
  if (!config) throw new Error("YooKassa is not configured");

  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader(config.shopId, config.secretKey));
  headers.set("Content-Type", "application/json");

  const response = await fetch("https://api.yookassa.ru/v3" + path, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    console.error("YooKassa API error", response.status, data);
    throw new Error(data?.description || data?.code || "YooKassa API error");
  }

  return data;
}

export async function createPayment(args: {
  product: EditaProduct;
  returnUrl: string;
  customerEmail?: string;
}) {
  const product = PRODUCTS[args.product];
  const orderId = "edita-" + randomUUID();
  const body: any = {
    amount: { value: product.amount, currency: "RUB" },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: args.returnUrl,
    },
    description: product.name,
    metadata: {
      order_id: orderId,
      product: args.product,
    },
    save_payment_method: false,
  };

  const vatCode = process.env.YOOKASSA_VAT_CODE;
  if (args.customerEmail && vatCode) {
    body.receipt = {
      customer: { email: args.customerEmail },
      items: [
        {
          description: product.name,
          quantity: "1.00",
          amount: { value: product.amount, currency: "RUB" },
          vat_code: Number(vatCode),
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    };
  }

  const data = await yookassaRequest("/payments", {
    method: "POST",
    headers: { "Idempotence-Key": randomUUID() },
    body: JSON.stringify(body),
  });

  return { data, orderId };
}
