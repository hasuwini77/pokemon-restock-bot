import type { TraderaItem } from "./tradera.ts";
import type { State } from "./types.ts";

export interface DealItem { name: string; group: string; match: string[]; maxPrice?: number }
export interface DealsConfig { groups: Record<string, string>; schedule?: string[]; items: DealItem[] }
export interface Reference { price: number; shop: string; manual: boolean }
export interface Deal { item: DealItem; listing: TraderaItem; ref: Reference }

// Listings that look like the product but aren't the sealed English product.
const JUNK =
  /\btom(ma)?\b|empty|endast|\bonly\b|\butan\b|sleeves?|\bpins?\b|proxy|fake|kopia|replika|japansk|japanese|\bjp\b|kinesisk|chinese|korean|koreansk|\blösa?\b|single|digital|\bkod\b|\bcode\b|sleeved|(?<!o)öppna[dt]?|(?<!o)öppen|opened|begagnad|\bused\b|skadad|damaged|plocka[dt]|uttagna?|saknas|ej komplett|inte komplett|ofullständig|missing/i;
// The seller must say it's sealed (title or description), otherwise we skip it.
const SEALED = /förseglad|fabriksförseglad|inplastad|i plast|oöppnad|oöppnat|obruten|sealed|shrink ?wrap/i;

/** Listing passes only if title + seller description show it's sealed and complete. */
export function isSealedListing(title: string, description: string): boolean {
  const text = `${title}\n${description}`;
  return !JUNK.test(text) && SEALED.test(text);
}
// Shop titles to ignore as a price reference (different product than the English retail box).
const NOT_RETAIL = /japansk|japanese|kinesisk|chinese|korean|sleeved|acrylic|akryl|utan plast/i;

const matches = (title: string, item: DealItem) => item.match.every((m) => new RegExp(m, "i").test(title));

/** Lowest listed shop price for the item, measured from the latest scrape. */
export function reference(state: State, item: DealItem): Reference | null {
  if (item.maxPrice) return { price: item.maxPrice, shop: "your max price", manual: true };
  let best: Reference | null = null;
  for (const [shop, products] of Object.entries(state)) {
    for (const p of Object.values(products)) {
      if (!p.price || NOT_RETAIL.test(p.title) || !matches(p.title, item)) continue;
      if (!best || p.price < best.price) best = { price: p.price, shop, manual: false };
    }
  }
  return best;
}

/** Highest reference in a group: sent to Tradera as PriceMaximum so results are only candidates. */
export function groupCeiling(state: State, items: DealItem[]): number | null {
  const refs = items.map((i) => reference(state, i)?.price).filter((p): p is number => p != null);
  return refs.length ? Math.max(...refs) - 1 : null;
}

/** Buy Now listings strictly below the reference for any item in the group. */
export function findDeals(listings: TraderaItem[], items: DealItem[], state: State): Deal[] {
  const deals: Deal[] = [];
  for (const listing of listings) {
    if (listing.buyNow == null || JUNK.test(listing.title)) continue;
    for (const item of items) {
      if (!matches(listing.title, item)) continue;
      const ref = reference(state, item);
      if (ref && listing.buyNow < ref.price) deals.push({ item, listing, ref });
      if (ref) break; // first item with a known shop price wins
    }
  }
  return deals;
}
