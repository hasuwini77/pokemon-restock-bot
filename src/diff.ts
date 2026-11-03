import type { Alert, Product, State } from "./types.ts";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // one alert per product per 6 h (stops flapping spam)

/**
 * Compare a fresh scrape with stored state. Mutates `state`.
 * - First time a shop is seen: baseline only, no alerts.
 * - restock: was out of stock, now buyable.
 * - new: never seen before at this shop.
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

    const cooled = !prev?.lastAlert || now.getTime() - Date.parse(prev.lastAlert) > COOLDOWN_MS;
    if (kind && cooled) alerts.push({ kind, product: p });

    known[p.id] = {
      title: p.title,
      inStock: p.inStock,
      price: p.price,
      firstSeen: prev?.firstSeen ?? iso,
      lastAlert: kind && cooled ? iso : prev?.lastAlert,
    };
  }
  return alerts;
}
