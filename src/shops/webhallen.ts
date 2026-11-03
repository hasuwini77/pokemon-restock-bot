import { get, sleep } from "../http.ts";
import type { Product } from "../types.ts";

const BASE = "https://www.webhallen.com";

interface WhProduct {
  id: number;
  name: string;
  categoryTree: string;
  price?: { price: string };
  image?: string;
  stock: Record<string, unknown> & { web?: number };
}

export function parseWebhallen(json: string): { products: Product[]; total: number } {
  const d = JSON.parse(json) as { products: WhProduct[]; totalProductCount: number };
  const products = d.products
    .filter((p) => /Samlarkortspel\/Pok/i.test(p.categoryTree))
    .map((p) => {
      // Numeric keys = physical stores; "web" = webshop.
      const stores = Object.entries(p.stock)
        .filter(([k, v]) => /^\d+$/.test(k) && typeof v === "number")
        .reduce((n, [, v]) => n + (v as number), 0);
      return {
        shop: "Webhallen",
        id: String(p.id),
        title: p.name,
        url: `${BASE}/se/product/${p.id}`,
        price: p.price ? Number(p.price.price) : null,
        inStock: (p.stock.web ?? 0) > 0 || stores > 0,
        image: p.image,
      };
    });
  return { products, total: d.totalProductCount };
}

export async function webhallen(): Promise<Product[]> {
  const all: Product[] = [];
  let total = Infinity; // only page 1 reports totalProductCount (later pages return null)
  for (let page = 1; page <= 12; page++) {
    const json = await get(
      `${BASE}/api/productdiscovery/search/pokemon?page=${page}&touchpoint=DESKTOP&totalProductCountSet=${page > 1}`,
    );
    const res = parseWebhallen(json);
    if (page === 1) total = res.total;
    all.push(...res.products);
    if (page * 24 >= total) break;
    await sleep(1500);
  }
  return all;
}
