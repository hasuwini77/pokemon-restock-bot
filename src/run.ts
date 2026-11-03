import { readFile, writeFile } from "node:fs/promises";
import { diff } from "./diff.ts";
import { sendDiscord } from "./discord.ts";
import { isWatched } from "./filter.ts";
import { alphaspel } from "./shops/alphaspel.ts";
import { dragonslair } from "./shops/dragonslair.ts";
import { sfbok } from "./shops/sfbok.ts";
import { webhallen } from "./shops/webhallen.ts";
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

for (const a of alerts) console.log(`  [${a.kind}] ${a.product.shop} · ${a.product.title} · ${a.product.price} kr`);

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (alerts.length && !dry) {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not set");
  await sendDiscord(webhook, alerts, process.env.DISCORD_MENTION);
}
await writeFile(STATE_FILE, JSON.stringify(state, null, 1) + "\n");
if (failures === Object.keys(SHOPS).length) process.exit(1);
