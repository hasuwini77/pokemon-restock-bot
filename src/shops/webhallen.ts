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

export function parseWebhallen(json: string, category = /Samlarkortspel\/Pok/i): { products: Product[]; total: number } {
  const d = JSON.parse(json) as { products: WhProduct[]; totalProductCount: number };
  const products = d.products
    .filter((p) => category.test(p.categoryTree))
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

export async function webhallen(query = "pokemon", category = /Samlarkortspel\/Pok/i): Promise<Product[]> {
  const all: Product[] = [];
  let total = Infinity; // only page 1 reports totalProductCount (later pages return null)
  for (let page = 1; page <= 12; page++) {
    const json = await get(
      `${BASE}/api/productdiscovery/search/${encodeURIComponent(query)}?page=${page}&touchpoint=DESKTOP&totalProductCountSet=${page > 1}`,
    );
    const res = parseWebhallen(json, category);
    if (page === 1) total = res.total;
    all.push(...res.products);
    if (page * 24 >= total) break;
    await sleep(1500);
  }
  return all;
}

/** Search sometimes returns hidden products for one run; their product page is a 404. Network errors count as alive. */
export async function webhallenAlive(id: string): Promise<boolean> {
  try {
    const d = JSON.parse(await get(`${BASE}/api/product/${id}`));
    return !Array.isArray(d) && !!d?.product;
  } catch (e) {
    return !String(e).includes("404");
  }
}
