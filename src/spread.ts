// Spread report: for each watched item, sealed-looking Tradera Buy Now ASKING prices vs the lowest shop price.
// Asking prices, not sold prices. One Tradera call per group.
import { readFile } from "node:fs/promises";
import { loadCardmarket } from "./cardmarket.ts";
import { JUNK, matches, reference, type CmRef, type DealItem, type DealsConfig } from "./deals.ts";
import { searchTradera, type TraderaItem } from "./tradera.ts";
import type { State } from "./types.ts";

export interface SpreadRow { name: string; shop: number | null; shopName: string; n: number; low: number | null; median: number | null; pct: number | null }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export function spreadRows(listings: TraderaItem[], items: DealItem[], state: State, cm?: CmRef | null): SpreadRow[] {
  return items.map((item) => {
    const asks = listings
      .filter((l) => l.buyNow != null && !JUNK.test(l.title) && matches(l.title, item))
      .map((l) => l.buyNow as number);
    const ref = reference(state, { ...item, maxPrice: undefined }, cm);
    const med = median(asks);
    return {
      name: item.name,
      shop: ref?.price ?? null,
      shopName: ref?.shop ?? "-",
      n: asks.length,
      low: asks.length ? Math.min(...asks) : null,
      median: med,
      pct: ref && med != null ? Math.round(((med - ref.price) / ref.price) * 100) : null,
    };
  });
}

export function formatRows(rows: SpreadRow[]): string {
  const sorted = [...rows].sort((a, b) => (b.pct ?? -999) - (a.pct ?? -999));
  const lines = sorted.map((r) =>
    `${(r.pct == null ? "  n/a" : `${r.pct > 0 ? "+" : ""}${r.pct}%`).padStart(6)}  ${String(r.shop ?? "-").padStart(5)} → ${String(r.median ?? "-").padStart(5)} kr  n=${String(r.n).padStart(2)}  ${r.name}`,
  );
  return ["  gap   ref → Tradera median ask (ref = cheapest of Swedish shops excl. Dragon's Lair and Cardmarket trend)", ...lines].join("\n");
}

if (import.meta.main) {
  const { TRADERA_APP_ID: appId, TRADERA_APP_KEY: appKey, DISCORD_WEBHOOK_URL: webhook } = process.env;
  if (!appId || !appKey) throw new Error("TRADERA_APP_ID / TRADERA_APP_KEY not set");
  const cfg: DealsConfig = JSON.parse(await readFile(process.env.DEALS_FILE ?? "deals.json", "utf8"));
  const state: State = JSON.parse(await readFile(process.env.STATE_FILE ?? "state.json", "utf8"));
  const cmIndex = await loadCardmarket(Number(process.env.CM_GAME ?? 6), process.env.CM_FILE ?? "cardmarket-pokemon.json");
  const cm = cmIndex && { index: cmIndex, shippingSek: cfg.cardmarketShippingSek ?? 0 };
  const rows: SpreadRow[] = [];
  for (const [group, words] of Object.entries(cfg.groups)) {
    const res = await searchTradera(appId, appKey, { SearchWords: words, OnlyAuctionsWithBuyNow: true, ItemsPerPage: 240, PageNumber: 1 });
    rows.push(...spreadRows(res.items, cfg.items.filter((i) => i.group === group), state, cm));
    console.log(`[${group}] ${res.items.length} of ${res.total} Buy Now listings`);
  }
  const table = formatRows(rows);
  console.log(table);
  if (webhook && !process.env.DRY_RUN) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "📊 Spread report: shop price vs Tradera asking price",
          color: 0x9b59b6,
          description: "```\n" + table.slice(0, 3900) + "\n```\nAsking prices (not sold), titles filtered for opened/empty/JP/CN. Small n = weak signal.",
        }],
      }),
    });
    if (!res.ok) throw new Error(`Discord ${res.status}`);
  }
}
