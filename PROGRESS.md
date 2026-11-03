# Progress

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
