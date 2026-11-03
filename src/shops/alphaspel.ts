import { get, sleep } from "../http.ts";
import type { Product } from "../types.ts";

const BASE = "https://alphaspel.se";
const CATEGORY = "/1762-pokemon-tcg/";

const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

export function parseAlphaspel(html: string): Product[] {
  const cards = html.split('<div class="product">').slice(1);
  const out: Product[] = [];
  for (const c of cards) {
    const href = c.match(/<a href="(\/[^"]+)"/)?.[1];
    const title = c.match(/<div class="product-name">([^<]+)/)?.[1];
    const id = c.match(/\/checkout\/add\/(\d+)/)?.[1] ?? href?.match(/\/(\d+)-[^/]*\/?$/)?.[1]; // product id is the last path segment
    if (!href || !title || !id) continue;
    const price = c.match(/<div class="price[^"]*">\s*([\d\s]+)\s*kr/)?.[1];
    const btn = c.match(/class="([^"]*)add-to-cart"/)?.[1] ?? "disabled";
    out.push({
      shop: "Alphaspel",
      id,
      title: decode(title),
      url: BASE + href,
      price: price ? Number(price.replace(/\s/g, "")) : null,
      inStock: !btn.includes("disabled"),
      image: c.match(/<img[^>]+src="([^"]+)"/)?.[1]?.replace(/^\//, BASE + "/"),
    });
  }
  return out;
}

export async function alphaspel(category = CATEGORY): Promise<Product[]> {
  const all: Product[] = [];
  // Newest first: new listings and restocks of recent sets live on the first pages.
  for (let page = 1; page <= 3; page++) {
    const batch = parseAlphaspel(
      await get(`${BASE}${category}?order_by=new&ordering=desc&page=${page}`),
    );
    all.push(...batch);
    if (batch.length < 48) break;
    await sleep(2000);
  }
  return all;
}
