# Progress

## 2026-11-03 (v0.6.0)
- MTG Tradera deals on its own Tradera app: `deals-mtg.json` (15 sets x collector display/pack, play display, gift bundle, bundle; 58/75 have a shop price), collector queried every other call.
- MTG spread report added to weekly workflow. First run: Final Fantasy is the only clear premium (play display +236% n=2, collector pack +184% n=2); many MTG items ask BELOW Swedish shop prices on Tradera (thin samples).
- MTG Discord webhook verified (test alert sent locally).

## 2026-11-03 (v0.5.0)
- MTG channel: same 4 shops (Webhallen MTG category, Dragon's Lair magic collection, Alphaspel boosters/displays/bundles, SF Bok MTG). Live dry run: 7 / 15 / 161 / 28 sealed.
- Price-drop alert (in stock, -10%+ vs last seen) for both channels.
- Fixed: Alphaspel out-of-stock cards fell back to the category id (merged products); hex entities in titles. Pokémon Alphaspel state re-baselined.
- MTG Tradera deals pending a 2nd Tradera app (100 calls/day per app; Pokémon uses ~76).

## 2026-11-03 (v0.4.0)
- Spread report (`src/spread.ts`, weekly Mon 07:00 UTC + manual): Tradera Buy Now median ASK vs lowest shop price per item, 5 calls.
  - First live run: 30th Booster Bundle +44% (n=54), Destined Rivals ETB +66% (n=24), 30th ETB +77% (n=6), 30th Mini Tin +58% (n=7). Asking, not sold.

## 2026-11-03 (v0.3.0)
- Tradera sealed-only: candidate's seller description fetched from item page; must say sealed (förseglad/inplastad/oöppnad), rejects opened/picked/missing. Real 319 kr "opened + picked" ETB now rejected (verified on saved page).
- 30th Celebration focus: dedicated Tradera group run every other call (8 items, refs from shops), ⭐ on 30th alerts.

## 2026-11-03 (v0.2.0)
- Tradera deal alerts: 4 groups (ETB, bundle, display, premium) round-robin, 1 API call per >=19 min (<=76/day of 100).
  - Reference = lowest English retail price across the 4 shops in state.json (measured), or manual `maxPrice`.
  - Verified locally: live call with PriceMaximum shrank ETB results 640 -> 201; 1 candidate deal found; opened boxes filtered; 12 tests pass.

## 2026-11-03
- v0.1.0: restock + new-listing alerts to Discord for Webhallen, Dragon's Lair, Alphaspel, SF Bok.
  - GitHub Actions cron every 10 min (public repo, free); state in committed `state.json`.
  - Sealed-only filter, silent first-run baseline, 6 h per-product cooldown, burst guard (>10 "new" = re-baseline).
  - Verified locally: live scrape counts SF Bok 27 / Webhallen 50 / Alphaspel 77 / Dragon's Lair 688; simulated restock + new alerts fire; 9 unit tests pass.
  - Verified on GitHub: all 4 shops scrape from runner IPs (2 runs, 0 false alerts); Discord test alert received.
  - Unverified: SF Bok pagination (first page only).
