# Progress

## 2026-11-03
- v0.1.0: restock + new-listing alerts to Discord for Webhallen, Dragon's Lair, Alphaspel, SF Bok.
  - GitHub Actions cron every 10 min (public repo, free); state in committed `state.json`.
  - Sealed-only filter, silent first-run baseline, 6 h per-product cooldown, burst guard (>10 "new" = re-baseline).
  - Verified locally: live scrape counts SF Bok 27 / Webhallen 50 / Alphaspel 77 / Dragon's Lair 688; simulated restock + new alerts fire; 9 unit tests pass.
  - Verified on GitHub: all 4 shops scrape from runner IPs (2 runs, 0 false alerts); Discord test alert received.
  - Unverified: SF Bok pagination (first page only).
