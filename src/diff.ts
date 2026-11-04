import type { Alert, Product, State } from "./types.ts";

const DROP = 0.1; // alert when an in-stock price falls 10%+ since last seen
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // one alert per product per 6 h (stops flapping spam)

/**
 * Compare a fresh scrape with stored state. Mutates `state`.
 * - First time a shop is seen: baseline only, no alerts.
 * - restock: was out of stock, now buyable.
 * - new: never seen before at this shop.
 * - drop: in stock and price fell >=10% (a sale).
 */
export function diff(state: State, shop: string, products: Product[], now = new Date()): Alert[] {
  const iso = now.toISOString();
  const baseline = !state[shop];
  const known = (state[shop] ??= {});
  const alerts: Alert[] = [];

  for (const p of products) {
    const prev = known[p.id];
    let kind: Alert["kind"] | null = null;
    if (!prev) kind = baseline ? null : "new";
    else if (!prev.inStock && p.inStock) kind = "restock";
    else if (p.inStock && prev.price && p.price && p.price <= prev.price * (1 - DROP)) kind = "drop";

    const cooled = !prev?.lastAlert || now.getTime() - Date.parse(prev.lastAlert) > COOLDOWN_MS;
    if (kind && cooled)
      alerts.push({
        kind,
        product: p,
        note: kind === "drop" ? `was ${prev!.price} kr (-${Math.round((1 - p.price! / prev!.price!) * 100)}%)` : undefined,
      });

    known[p.id] = {
      title: p.title,
      inStock: p.inStock,
      price: p.price,
      url: p.url,
      firstSeen: prev?.firstSeen ?? iso,
      lastAlert: kind && cooled ? iso : prev?.lastAlert,
    };
  }
  return alerts;
}
