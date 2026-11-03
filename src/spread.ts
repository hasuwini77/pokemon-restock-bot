// Spread report: for each watched item, sealed-looking Tradera Buy Now ASKING prices vs the lowest shop price.
// Asking prices, not sold prices. One Tradera call per group.
import { readFile } from "node:fs/promises";
import { loadCardmarket } from "./cardmarket.ts";
import { JUNK, matches, reference, type CmRef, type DealItem, type DealsConfig } from "./deals.ts";
import { searchTradera, type TraderaItem } from "./tradera.ts";
import type { State } from "./types.ts";

export interface SpreadRow { name: string; shop: number | null; shopName: string; shopUrl?: string; n: number; low: number | null; median: number | null; pct: number | null }

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
      shopUrl: ref?.url,
      n: asks.length,
      low: asks.length ? Math.min(...asks) : null,
      median: med,
      pct: ref && med != null ? Math.round(((med - ref.price) / ref.price) * 100) : null,
    };
  });
}

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;
const traderaSearch = (name: string) => `https://www.tradera.com/search?q=${encodeURIComponent(name)}`;

/** Short Discord list: only real gaps (>= minPct, >= minAds listings), best first, every price clickable. */
export function formatFlips(rows: SpreadRow[], minPct = 20, minAds = 2, max = 10): string {
  const ok = rows.filter((r) => r.pct != null && r.pct >= minPct && r.n >= minAds && r.shop != null && r.median != null);
  const top = ok.sort((a, b) => (b.pct as number) - (a.pct as number)).slice(0, max);
  if (!top.length) return "Nothing worth flipping this week.";
  const buyAt = (r: SpreadRow) => {
    const where = r.shopName.startsWith("Cardmarket") ? "Cardmarket" : r.shopName;
    return r.shopUrl ? `[${where}](${r.shopUrl})` : where;
  };
  return top
    .map((r) => `**+${r.pct}%** · ${r.name}\nBuy **${kr(r.shop!)}** at ${buyAt(r)} → [Tradera](${traderaSearch(r.name)}) asks ~**${kr(r.median!)}** (${r.n} ads)`)
    .join("\n\n");
}

if (import.meta.main) {
  const { TRADERA_APP_ID: appId, TRADERA_APP_KEY: appKey, DISCORD_WEBHOOK_URL: webhook } = process.env;
  if (!appId || !appKey) throw new Error("TRADERA_APP_ID / TRADERA_APP_KEY not set");
  const cfg: DealsConfig = JSON.parse(await readFile(process.env.DEALS_FILE ?? "deals.json", "utf8"));
  const state: State = JSON.parse(await readFile(process.env.STATE_FILE ?? "state.json", "utf8"));
  const game = Number(process.env.CM_GAME ?? 6);
  const cmIndex = await loadCardmarket(game, process.env.CM_FILE ?? "cardmarket-pokemon.json");
  const cm = cmIndex && { index: cmIndex, shippingSek: cfg.cardmarketShippingSek ?? 0, site: game === 1 ? "Magic" : "Pokemon" };
  const rows: SpreadRow[] = [];
  for (const [group, words] of Object.entries(cfg.groups)) {
    const res = await searchTradera(appId, appKey, { SearchWords: words, OnlyAuctionsWithBuyNow: true, ItemsPerPage: 240, PageNumber: 1 });
    rows.push(...spreadRows(res.items, cfg.items.filter((i) => i.group === group), state, cm));
    console.log(`[${group}] ${res.items.length} of ${res.total} Buy Now listings`);
  }
  const text = formatFlips(rows.filter((r) => r.shop != null && r.shop <= (cfg.maxBuy ?? Infinity)));
  console.log(text);
  if (webhook && !process.env.DRY_RUN) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "💰 Best flips this week",
          color: 0x9b59b6,
          description: text.slice(0, 3900),
          footer: { text: "Tradera = asking prices, not sold. Only gaps ≥ 20% with 2+ ads." },
        }],
      }),
    });
    if (!res.ok) throw new Error(`Discord ${res.status}`);
  }
}
