import { cmMatch, type CmIndex } from "./cardmarket.ts";
import type { TraderaItem } from "./tradera.ts";
import type { State } from "./types.ts";

export interface DealItem { name: string; group: string; match: string[]; cm?: string[]; maxPrice?: number }
export interface DealsConfig { groups: Record<string, string>; minDiscount?: number; maxBuy?: number; cardmarketShippingSek?: number; items: DealItem[] }
/** Cardmarket data + shipping estimate used as an extra price reference. */
export interface CmRef { index: CmIndex; shippingSek: number; site?: string } // site = Cardmarket URL game path, e.g. "Magic"
export interface Reference { price: number; shop: string; manual: boolean; url?: string }
export interface Deal { item: DealItem; listing: TraderaItem; ref: Reference }

// Listings that look like the product but aren't the sealed English product.
export const JUNK =
  /\btom(ma)?\b|empty|endast|\bonly\b|\butan\b|sleeves?|\bpins?\b|proxy|fake|kopia|replika|japansk|japanese|\bjp\b|kinesisk|chinese|korean|koreansk|spanska?|tyska?|german|franska?|french|italiensk[a]?|italian|portugisisk[a]?|ryska?|russian|\blösa?\b|single|digital|\bkod\b|\bcode\b|sleeved|(?<!o)öppna[dt]?|(?<!o)öppen|opened|begagnad|\bused\b|skadad|damaged|plocka[dt]|uttagna?|saknas|ej komplett|inte komplett|ofullständig|missing/i;
// The seller must say it's sealed (title or description), otherwise we skip it.
const SEALED = /förseglad|fabriksförseglad|inplastad|i plast|oöppnad|oöppnat|obruten|sealed|shrink ?wrap/i;

/** Listing passes only if title + seller description show it's sealed and complete. */
export function isSealedListing(title: string, description: string): boolean {
  const text = `${title}\n${description}`;
  return !JUNK.test(text) && SEALED.test(text);
}
// Shop titles to ignore as a price reference (different product than the English retail box).
const NOT_RETAIL = /japansk|japanese|kinesisk|chinese|korean|sleeved|acrylic|akryl|utan plast/i;

export const matches = (title: string, item: DealItem) => item.match.every((m) => new RegExp(m, "i").test(title));

// Still watched for restocks, but its prices run above market, so it never sets the "deal" bar.
const NOT_A_REFERENCE = new Set(["Dragon's Lair"]);

/** Lowest listed shop price for the item, measured from the latest scrape. */
export function reference(state: State, item: DealItem, cm?: CmRef | null): Reference | null {
  if (item.maxPrice) return { price: item.maxPrice, shop: "your max price", manual: true };
  let best: Reference | null = null;
  for (const [shop, products] of Object.entries(state)) {
    if (NOT_A_REFERENCE.has(shop)) continue;
    for (const p of Object.values(products)) {
      if (!p.price || NOT_RETAIL.test(p.title) || !matches(p.title, item)) continue;
      if (!best || p.price < best.price) best = { price: p.price, shop, manual: false, url: p.url };
    }
  }
  if (cm) {
    const p = cmMatch(cm.index, item.cm ?? item.match);
    const price = p ? Math.round(p.trend * cm.index.eurSek + cm.shippingSek) : null;
    if (p && price && (!best || price < best.price))
      best = { price, shop: `Cardmarket trend${cm.shippingSek ? " + shipping" : ""} (${p.trend.toFixed(2)} €)`, manual: false,
        url: cm.site && `https://www.cardmarket.com/en/${cm.site}/Products/Search?searchString=${encodeURIComponent(p.name)}` };
  }
  return best;
}

/** Highest reference in a group: sent to Tradera as PriceMaximum so results are only candidates. */
export function groupCeiling(state: State, items: DealItem[], cm?: CmRef | null): number | null {
  const refs = items.map((i) => reference(state, i, cm)?.price).filter((p): p is number => p != null);
  return refs.length ? Math.max(...refs) - 1 : null;
}

/** Buy Now listings at least `minDiscount` (0.15 = 15%) below the reference for any item in the group, priced <= maxBuy kr. */
export function findDeals(listings: TraderaItem[], items: DealItem[], state: State, minDiscount = 0, cm?: CmRef | null, maxBuy = Infinity): Deal[] {
  const deals: Deal[] = [];
  for (const listing of listings) {
    if (listing.buyNow == null || listing.buyNow > maxBuy || JUNK.test(listing.title)) continue;
    for (const item of items) {
      if (!matches(listing.title, item)) continue;
      const ref = reference(state, item, cm);
      if (ref && listing.buyNow < ref.price * (1 - minDiscount)) deals.push({ item, listing, ref });
      if (ref) break; // first item with a known shop price wins
    }
  }
  return deals;
}
