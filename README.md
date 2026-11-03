# pokemon-restock-bot

Two Discord channels: **pokemon** (`DISCORD_WEBHOOK_URL`) and **mtg** (`DISCORD_MTG_WEBHOOK_URL`), same 4 shops.
MTG tracks booster boxes/displays, collector boosters and bundles (`isWatchedMtg` in `src/filter.ts`), ⭐ on Collector.
Both channels alert on restock, new listing, and **price drop ≥10%** on in-stock items.

Polls Swedish Pokémon TCG shops every ~10 min (free GitHub Actions) and pings Discord when sealed product
**comes back in stock** or a **new listing** appears.

| Shop | Source | "In stock" means |
|---|---|---|
| Webhallen | `/api/productdiscovery/search/pokemon` (JSON) | web stock or any store stock > 0 |
| Dragon's Lair | Shopify `collections/pokemon-the-trading-card-game/products.json` | any variant `available` |
| Alphaspel | `/1762-pokemon-tcg/` newest first, 3 pages (HTML) | "Köp" button enabled |
| SF Bok | Pokémon TCG category page (embedded JSON) | `stockQuantity` > 0 |

Only sealed product is tracked (booster, display, ETB, bundle, UPC, collection, tin, blister…), see `src/filter.ts`.
The first run per shop records a silent baseline. Each product alerts at most once per 6 h.

## Tradera deals
Every ~20 min (free API: 100 calls/day) one product group from `deals.json` is searched on Tradera, Buy Now only,
capped at the group's highest shop price. A listing alerts when its Buy Now price is **below the lowest price for the same
product in the shops above** (measured from the latest scrape), or below your own `maxPrice` if you set one.
Opened/empty/Japanese/Chinese/used listings are skipped. Edit `deals.json` to add products.

## Setup
1. Discord: Server settings → Integrations → Webhooks → New webhook → copy URL.
2. Repo → Settings → Secrets and variables → Actions → secret `DISCORD_WEBHOOK_URL`.
3. Tradera: register an app at api.tradera.com → secrets `TRADERA_APP_ID`, `TRADERA_APP_KEY` (App Key, not Public Key).
4. Optional variable `DISCORD_MENTION` = `@everyone` (or `<@&ROLE_ID>`).
5. Actions → poll → Run workflow (first run = baseline, no alerts).

## Local
```
npm test
npm run dry      # scrape + diff, prints alerts, sends nothing
```

## Adding a shop
Write `src/shops/<shop>.ts` returning `Product[]`, register it in `SHOPS` in `src/run.ts`.
Shopify shops can reuse `parseShopify`.

Prices are the shop's listed price only; the bot makes no resale-value claims.
