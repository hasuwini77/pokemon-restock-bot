import { readFile, writeFile } from "node:fs/promises";
import { findDeals, groupCeiling, isSealedListing, type DealsConfig } from "./deals.ts";
import { diff } from "./diff.ts";
import { sendDiscord } from "./discord.ts";
import { isWatched } from "./filter.ts";
import { alphaspel } from "./shops/alphaspel.ts";
import { dragonslair } from "./shops/dragonslair.ts";
import { sfbok } from "./shops/sfbok.ts";
import { webhallen } from "./shops/webhallen.ts";
import { get, sleep } from "./http.ts";
import { parseDescription, searchTradera } from "./tradera.ts";
import type { Alert, Product, State } from "./types.ts";

const SHOPS: Record<string, () => Promise<Product[]>> = {
  Webhallen: webhallen,
  "Dragon's Lair": dragonslair,
  Alphaspel: alphaspel,
  "SF Bok": sfbok,
};

const STATE_FILE = process.env.STATE_FILE ?? "state.json";
const dry = !!process.env.DRY_RUN;

const state: State = JSON.parse(await readFile(STATE_FILE, "utf8").catch(() => "{}"));
const alerts: Alert[] = [];
let failures = 0;

const results = await Promise.allSettled(
  Object.entries(SHOPS).map(async ([shop, fetchShop]) => {
    const all = await fetchShop();
    const watched = all.filter((p) => isWatched(p.title));
    if (all.length === 0) throw new Error("0 products parsed (layout change?)");
    let found = diff(state, shop, watched);
    // A burst of "new" means the scrape widened (layout/paging change), not real listings.
    const fresh = found.filter((a) => a.kind === "new").length;
    if (fresh > 10) {
      console.warn(`${shop}: ${fresh} new at once, treating as re-baseline`);
      found = found.filter((a) => a.kind !== "new");
    }
    alerts.push(...found);
    console.log(
      `${shop}: ${all.length} parsed, ${watched.length} sealed, ${watched.filter((p) => p.inStock).length} buyable, ${found.length} alerts`,
    );
  }),
);
for (const [i, r] of results.entries()) {
  if (r.status === "rejected") {
    failures++;
    console.error(`${Object.keys(SHOPS)[i]}: FAILED ${r.reason}`); // state for that shop untouched
  }
}

// Tradera: free API allows 100 calls / 24 h, so one group query per >=19 min (max ~76/day).
const TRADERA_FILE = process.env.TRADERA_STATE_FILE ?? "tradera-state.json";
const tState: { lastCall?: string; next: number; seen: Record<string, string> } = JSON.parse(
  await readFile(TRADERA_FILE, "utf8").catch(() => '{"next":0,"seen":{}}'),
);
const { TRADERA_APP_ID: appId, TRADERA_APP_KEY: appKey } = process.env;
const due = !tState.lastCall || Date.now() - Date.parse(tState.lastCall) >= 19 * 60_000;
if (appId && appKey && due && failures < Object.keys(SHOPS).length) {
  const cfg: DealsConfig = JSON.parse(await readFile("deals.json", "utf8"));
  const groups = cfg.schedule ?? Object.keys(cfg.groups);
  const group = groups[tState.next % groups.length];
  tState.next = (tState.next + 1) % groups.length;
  tState.lastCall = new Date().toISOString();
  const items = cfg.items.filter((i) => i.group === group);
  const ceiling = groupCeiling(state, items);
  try {
    if (ceiling == null) throw new Error(`no shop reference price for any ${group} item`);
    const res = await searchTradera(appId, appKey, {
      SearchWords: cfg.groups[group],
      PriceMaximum: ceiling,
      OnlyAuctionsWithBuyNow: true,
      ItemsPerPage: 240,
      PageNumber: 1,
    });
    if (res.errors.length) throw new Error(res.errors.join("; "));
    const deals = findDeals(res.items, items, state);
    const fresh = deals.filter((d) => !tState.seen[d.listing.id]);
    let sent = 0;
    for (const d of fresh) {
      tState.seen[d.listing.id] = tState.lastCall; // checked once, alert or not
      try {
        const desc = parseDescription(await get(d.listing.url.replace(/^http:/, "https:")));
        await sleep(1000);
        if (!isSealedListing(d.listing.title, desc)) {
          console.log(`  skip (not clearly sealed): ${d.listing.title} · ${d.listing.buyNow} kr`);
          continue;
        }
      } catch (e) {
        console.log(`  skip (description unreadable: ${e}): ${d.listing.title}`);
        continue;
      }
      sent++;
      alerts.push({
        kind: "deal",
        product: { shop: "Tradera", id: d.listing.id, title: d.listing.title, url: d.listing.url, price: d.listing.buyNow, inStock: true, image: d.listing.image },
        note: `${d.item.name} · ${d.ref.manual ? "your max" : `lowest shop price ${d.ref.price} kr at ${d.ref.shop}`}`,
      });
    }
    console.log(`Tradera [${group}] <= ${ceiling} kr: ${res.items.length} of ${res.total} listings, ${deals.length} below ref, ${fresh.length} unseen, ${sent} alerts`);
  } catch (e) {
    console.error(`Tradera: FAILED ${e}`);
  }
  // Keep the seen-list bounded (listings older than 30 days can't re-alert meaningfully).
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const [id, t] of Object.entries(tState.seen)) if (Date.parse(t) < cutoff) delete tState.seen[id];
}

for (const a of alerts) console.log(`  [${a.kind}] ${a.product.shop} · ${a.product.title} · ${a.product.price} kr`);

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (alerts.length && !dry) {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not set");
  await sendDiscord(webhook, alerts, process.env.DISCORD_MENTION);
}
await writeFile(STATE_FILE, JSON.stringify(state, null, 1) + "\n");
await writeFile(TRADERA_FILE, JSON.stringify(tState, null, 1) + "\n");
if (failures === Object.keys(SHOPS).length) process.exit(1);
