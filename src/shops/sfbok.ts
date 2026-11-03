import { get } from "../http.ts";
import type { Product } from "../types.ts";

// Next.js (Centra) store: product data is embedded as escaped JSON in the RSC payload.
const BASE = "https://www.sfbok.se";
const CATEGORY = "/sv/spel/samlarkortspel-tcg-ccg/pokemon-trading-card-game";

export function parseSfbok(html: string): Product[] {
  const h = html.replace(/\\"/g, '"');
  const out = new Map<string, Product>();
  const re =
    /"displayName":"([^"]+)","slug":"([^"]+)"[^]*?"skuCode":"([^"]+)"[^]*?"bestPriceInclVat":([\d.]+)[^]*?"stockQuantity":(\d+)/g;
  for (const m of h.matchAll(re)) {
    const [, title, slug, sku, price, qty] = m;
    if (out.has(sku)) continue;
    out.set(sku, {
      shop: "SF Bok",
      id: sku,
      title,
      url: `${BASE}${CATEGORY}/${sku}/${slug}`,
      price: Number(price),
      inStock: Number(qty) > 0,
    });
  }
  return [...out.values()];
}

export async function sfbok(): Promise<Product[]> {
  return parseSfbok(await get(BASE + CATEGORY));
}
