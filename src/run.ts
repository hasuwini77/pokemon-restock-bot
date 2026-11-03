import { readFile, writeFile } from "node:fs/promises";
import { channels, type Channel } from "./channels.ts";
import { loadCardmarket } from "./cardmarket.ts";
import { findDeals, groupCeiling, isSealedListing, type DealsConfig } from "./deals.ts";
import { diff } from "./diff.ts";
import { sendDiscord } from "./discord.ts";
import { get, sleep } from "./http.ts";
import { parseDescription, searchTradera } from "./tradera.ts";
import type { Alert, Product, State } from "./types.ts";

const dry = !!process.env.DRY_RUN;
const only = process.env.CHANNEL; // run a single channel, e.g. CHANNEL=mtg

async function runChannel(ch: Channel): Promise<boolean> {
  const state: State = JSON.parse(await readFile(ch.stateFile, "utf8").catch(() => "{}"));
  const alerts: Alert[] = [];
  const shops = Object.entries(ch.shops);
  let failures = 0;

  const results = await Promise.allSettled(
    shops.map(async ([shop, fetchShop]) => {
      const all = await fetchShop();
      if (all.length === 0) throw new Error("0 products parsed (layout change?)");
      // Same product can appear twice (paging overlap); merge so it can't "restock" within one run.
      const byId = new Map<string, Product>();
      for (const p of all.filter((x) => ch.watch(x.title))) {
        const q = byId.get(p.id);
        byId.set(p.id, q ? { ...q, inStock: q.inStock || p.inStock } : p);
      }
      const watched = [...byId.values()];
      let found = diff(state, shop, watched);
      // A burst of "new" means the scrape widened (layout/paging change), not real listings.
      const fresh = found.filter((a) => a.kind === "new").length;
      if (fresh > 10) {
        console.warn(`[${ch.id}] ${shop}: ${fresh} new at once, treating as re-baseline`);
        found = found.filter((a) => a.kind !== "new");
      }
      alerts.push(...found);
      console.log(
        `[${ch.id}] ${shop}: ${all.length} parsed, ${watched.length} sealed, ${watched.filter((p) => p.inStock).length} buyable, ${found.length} alerts`,
      );
    }),
  );
  for (const [i, r] of results.entries()) {
    if (r.status === "rejected") {
      failures++;
      console.error(`[${ch.id}] ${shops[i][0]}: FAILED ${r.reason}`); // state for that shop untouched
    }
  }

  // Tradera: app dashboard shows 10,000 SearchAdvanced calls / 24 h, so every group is searched every run
  // (pokemon 5 + mtg 3 calls per run, ~1,150/day total).
  const t = ch.tradera;
  const cfgText = t && (await readFile(t.dealsFile, "utf8").catch(() => null));
  if (t && cfgText && t.appId && t.appKey && failures < shops.length) {
    const tState: { lastCall?: string; seen: Record<string, string> } = JSON.parse(
      await readFile(t.stateFile, "utf8").catch(() => '{"seen":{}}'),
    );
    const cfg: DealsConfig = JSON.parse(cfgText);
    const minDiscount = cfg.minDiscount ?? 0;
    const cmIndex = await loadCardmarket(t.cardmarketGame, t.cardmarketFile);
    const cm = cmIndex && { index: cmIndex, shippingSek: cfg.cardmarketShippingSek ?? 0 };
    tState.lastCall = new Date().toISOString();
    for (const group of Object.keys(cfg.groups)) {
      const items = cfg.items.filter((i) => i.group === group);
      const ceiling = groupCeiling(state, items, cm);
      try {
        if (ceiling == null) throw new Error(`no shop reference price for any ${group} item`);
        const cap = Math.min(ceiling, cfg.maxBuy ?? Infinity);
        const res = await searchTradera(t.appId, t.appKey, {
          SearchWords: cfg.groups[group],
          PriceMaximum: cap,
          OnlyAuctionsWithBuyNow: true,
          ItemsPerPage: 240,
          PageNumber: 1,
        });
        if (res.errors.length) throw new Error(res.errors.join("; "));
        const deals = findDeals(res.items, items, state, minDiscount, cm, cfg.maxBuy);
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
          const off = Math.round((1 - d.listing.buyNow! / d.ref.price) * 100);
          alerts.push({
            kind: "deal",
            product: { shop: "Tradera", id: d.listing.id, title: d.listing.title, url: d.listing.url, price: d.listing.buyNow, inStock: true, image: d.listing.image },
            note: `${d.item.name} · -${off}% vs ${d.ref.manual ? "your max" : `lowest shop price ${d.ref.price} kr at ${d.ref.shop}`}`,
          });
        }
        console.log(`[${ch.id}] Tradera [${group}] <= ${cap} kr: ${res.items.length} of ${res.total} listings, ${deals.length} deals, ${fresh.length} unseen, ${sent} alerts`);
      } catch (e) {
        console.error(`[${ch.id}] Tradera [${group}]: FAILED ${e}`);
      }
    }
    // Keep the seen-list bounded (listings older than 30 days can't re-alert meaningfully).
    const cutoff = Date.now() - 30 * 86_400_000;
    for (const [id, ts] of Object.entries(tState.seen)) if (Date.parse(ts) < cutoff) delete tState.seen[id];
    await writeFile(t.stateFile, JSON.stringify(tState, null, 1) + "\n");
  }

  for (const a of alerts) console.log(`  [${a.kind}] ${a.product.shop} · ${a.product.title} · ${a.product.price} kr`);
  if (alerts.length && !dry) {
    if (!ch.webhook) console.warn(`[${ch.id}] ${alerts.length} alerts not sent: webhook secret not set`);
    else await sendDiscord(ch.webhook, alerts, ch.mention, ch.priority);
  }
  await writeFile(ch.stateFile, JSON.stringify(state, null, 1) + "\n");
  return failures < shops.length;
}

let ok = true;
for (const ch of channels.filter((c) => !only || c.id === only)) ok = (await runChannel(ch)) && ok;
if (!ok) process.exit(1);
