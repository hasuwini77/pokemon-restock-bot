import { get, sleep } from "../http.ts";
import type { Product } from "../types.ts";

// Shopify store: collection products.json carries a per-variant `available` flag.
const BASE = "https://dragonslair.se";
const COLLECTION = "pokemon-the-trading-card-game";

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  images?: { src: string }[];
  variants: { price: string; available: boolean }[];
}

export function parseShopify(json: string, shop: string, base: string): Product[] {
  const d = JSON.parse(json) as { products: ShopifyProduct[] };
  return d.products.map((p) => ({
    shop,
    id: String(p.id),
    title: p.title,
    url: `${base}/products/${p.handle}`,
    price: p.variants[0] ? Number(p.variants[0].price) : null,
    inStock: p.variants.some((v) => v.available),
    image: p.images?.[0]?.src,
  }));
}

export async function dragonslair(collection = COLLECTION): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page <= 6; page++) {
    const batch = parseShopify(
      await get(`${BASE}/collections/${collection}/products.json?limit=250&page=${page}`),
      "Dragon's Lair",
      BASE,
    );
    all.push(...batch);
    if (batch.length < 250) break;
    await sleep(3000); // shop rate-limits aggressively
  }
  return all;
}
