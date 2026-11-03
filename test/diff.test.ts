import { test } from "node:test";
import assert from "node:assert/strict";
import { diff } from "../src/diff.ts";
import { isWatched } from "../src/filter.ts";
import type { Product, State } from "../src/types.ts";

const p = (id: string, inStock: boolean): Product => ({
  shop: "S", id, title: `Pokemon ETB ${id}`, url: "u", price: 100, inStock,
});
const t0 = new Date("2026-11-03T10:00:00Z");
const later = (h: number) => new Date(t0.getTime() + h * 3600_000);

test("first run is a silent baseline", () => {
  const s: State = {};
  assert.deepEqual(diff(s, "S", [p("a", false), p("b", true)], t0), []);
  assert.equal(Object.keys(s.S).length, 2);
});

test("out -> in stock fires restock; staying in stock does not", () => {
  const s: State = {};
  diff(s, "S", [p("a", false)], t0);
  assert.deepEqual(diff(s, "S", [p("a", true)], later(1)).map((x) => x.kind), ["restock"]);
  assert.deepEqual(diff(s, "S", [p("a", true)], later(2)), []);
});

test("unseen product after baseline fires new", () => {
  const s: State = {};
  diff(s, "S", [p("a", true)], t0);
  assert.deepEqual(diff(s, "S", [p("a", true), p("b", false)], later(1)).map((x) => x.kind), ["new"]);
});

test("flapping product is muted for 6 h", () => {
  const s: State = {};
  diff(s, "S", [p("a", false)], t0);
  assert.equal(diff(s, "S", [p("a", true)], later(1)).length, 1);
  diff(s, "S", [p("a", false)], later(2));
  assert.equal(diff(s, "S", [p("a", true)], later(3)).length, 0);
  diff(s, "S", [p("a", false)], later(7));
  assert.equal(diff(s, "S", [p("a", true)], later(8)).length, 1);
});

test("filter keeps sealed TCG, drops merch", () => {
  assert.ok(isWatched("Pokemon ME06 Delta Reign Booster Display"));
  assert.ok(isWatched("Pokémon TCG: Pitch Black Elite Trainer Box"));
  assert.ok(isWatched("Pokemon Lumiose City Mini Tin"));
  assert.ok(isWatched("Pokemon ME6 Delta Reign Sleeved Booster Display (24)"));
  assert.ok(!isWatched("Pokemon Elite Trainer Box Sleeves"));
  assert.ok(!isWatched("Pokemon Plush Gengar 30 cm"));
  assert.ok(!isWatched("Pokemon ME5 Pitch Black Samlarpärm 9-fickor"));
  assert.ok(!isWatched("Magic: The Gathering Booster Box"));
});

test("in-stock price drop of 10%+ fires drop with note", () => {
  const s: State = {};
  diff(s, "S", [p("a", true)], t0);
  const cheaper = { ...p("a", true), price: 85 };
  const [a] = diff(s, "S", [cheaper], later(1));
  assert.equal(a.kind, "drop");
  assert.equal(a.note, "was 100 kr (-15%)");
  assert.equal(diff(s, "S", [{ ...p("a", true), price: 80 }], later(2)).length, 0); // -6%, below threshold
});

test("mtg filter keeps boxes, collector and bundles; drops packs and accessories", async () => {
  const { isWatchedMtg } = await import("../src/filter.ts");
  assert.ok(isWatchedMtg("Magic The Gathering: Avatar: The Last Airbender Play Booster Display (30)"));
  assert.ok(isWatchedMtg("Aetherdrift Collector Booster"));
  assert.ok(isWatchedMtg("Magic The Gathering: Marvel Super Heroes Bundle"));
  assert.ok(!isWatchedMtg("Foundations Play Booster"));
  assert.ok(!isWatchedMtg("Ultra Pro Deck Box Collector"));
});
