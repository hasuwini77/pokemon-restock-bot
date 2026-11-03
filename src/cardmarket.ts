// Cardmarket's official public price files (daily, free, no scraping):
//   products_nonsingles_<game>.json  sealed product catalogue
//   price_guide_<game>.json          trend/low/avg per product (EUR)
// game 1 = Magic, 6 = Pokémon. Cached for 20 h in a small committed JSON.
import { readFile, writeFile } from "node:fs/promises";

const BASE = "https://downloads.s3.cardmarket.com/productCatalog";
const MAX_AGE_MS = 20 * 3600_000;

export interface CmProduct { id: number; name: string; trend: number; low: number | null }
export interface CmIndex { fetchedAt: string; priceDate: string; eurSek: number; products: CmProduct[] }

// Other-language prints, cases, Pokémon Center exclusives and samples aren't the retail English product.
const NOT_RETAIL = /\bJP\b|japanese|chinese|korean|indonesian|thai|\bcase\b|pokémon center|sample|\bcoin\b|prerelease/i;

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function eurSek(): Promise<number> {
  const xml = await (await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { signal: AbortSignal.timeout(20_000) })).text();
  const rate = Number(xml.match(/currency='SEK' rate='([\d.]+)'/)?.[1]);
  if (!rate) throw new Error("ECB EUR/SEK rate not found");
  return rate;
}

export function buildIndex(
  catalogue: { products: { idProduct: number; name: string }[] },
  guide: { createdAt: string; priceGuides: { idProduct: number; trend: number | null; low: number | null }[] },
  rate: number,
  now = new Date(),
): CmIndex {
  const prices = new Map(guide.priceGuides.map((p) => [p.idProduct, p]));
  const products: CmProduct[] = [];
  for (const p of catalogue.products) {
    const g = prices.get(p.idProduct);
    if (g?.trend) products.push({ id: p.idProduct, name: p.name, trend: g.trend, low: g.low });
  }
  return { fetchedAt: now.toISOString(), priceDate: guide.createdAt, eurSek: rate, products };
}

/** Cached index; refreshes from Cardmarket at most every 20 h. Falls back to the stale cache on errors. */
export async function loadCardmarket(game: number, cacheFile: string): Promise<CmIndex | null> {
  const cached: CmIndex | null = JSON.parse(await readFile(cacheFile, "utf8").catch(() => "null"));
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) return cached;
  try {
    const [catalogue, guide, rate] = await Promise.all([
      getJson(`${BASE}/productList/products_nonsingles_${game}.json`),
      getJson(`${BASE}/priceGuide/price_guide_${game}.json`),
      eurSek(),
    ]);
    const index = buildIndex(catalogue, guide, rate);
    await writeFile(cacheFile, JSON.stringify(index) + "\n");
    console.log(`Cardmarket game ${game}: ${index.products.length} sealed products priced, EUR/SEK ${rate}`);
    return index;
  } catch (e) {
    console.error(`Cardmarket game ${game}: refresh FAILED ${e}${cached ? " (using cache)" : ""}`);
    return cached;
  }
}

/** Cheapest-trend Cardmarket product whose name matches every regex. */
export function cmMatch(index: CmIndex, match: string[]): CmProduct | null {
  let best: CmProduct | null = null;
  for (const p of index.products) {
    if (NOT_RETAIL.test(p.name) || !match.every((m) => new RegExp(m, "i").test(p.name))) continue;
    if (!best || p.trend < best.trend) best = p;
  }
  return best;
}
