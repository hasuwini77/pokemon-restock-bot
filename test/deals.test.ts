import { test } from "node:test";
import assert from "node:assert/strict";
import { findDeals, isSealedListing, reference, type DealItem } from "../src/deals.ts";
import { parseDescription, parseSearch } from "../src/tradera.ts";
import type { State } from "../src/types.ts";

const s = (title: string, price: number) => ({ title, price, inStock: true, firstSeen: "", url: "https://shop.test/p" });
const state: State = {
  Webhallen: { a: s("Pokemon ME06 Delta Reign Elite Trainer Box", 849) },
  "SF Bok": { b: s("Pokemon TCG: Delta Reign Elite Trainer Box", 999) },
  "Dragon's Lair": { c: s("Delta Reign Elite Trainer Box (Japansk)", 300) },
};
const etb: DealItem = { name: "Delta Reign ETB", group: "etb", match: ["delta reign", "elite trainer"] };
const listing = (id: string, title: string, buyNow: number | null) => ({
  id, title, url: `https://www.tradera.com/item/1/${id}/x`, buyNow, nextBid: null, bids: 0, endDate: "",
});

test("reference = lowest English retail shop price, ignores Japanese", () => {
  assert.deepEqual(reference(state, etb), { price: 849, shop: "Webhallen", manual: false, url: "https://shop.test/p" });
  assert.equal(reference(state, { ...etb, maxPrice: 700 })?.price, 700);
  assert.equal(reference(state, { ...etb, match: ["nonexistent"] }), null);
  const dlOnly: State = { "Dragon's Lair": { x: s("Delta Reign Elite Trainer Box", 1295) } };
  assert.equal(reference(dlOnly, etb), null); // Dragon's Lair never sets the reference
});

test("deal only when Buy Now is strictly below reference and listing is not junk", () => {
  const deals = findDeals([
    listing("1", "Pokémon Elite Trainer Box – Delta Reign", 800),
    listing("2", "Pokémon Elite Trainer Box Delta Reign", 849),
    listing("3", "TOM Elite Trainer Box Delta Reign", 100),
    listing("4", "Delta Reign Elite Trainer Box japansk", 200),
    listing("5", "Delta Reign Elite Trainer Box", null),
    listing("6", "ÖPPNAD Pokémon Elite Trainer Box Delta Reign", 499),
    listing("7", "Delta Reign Elite Trainer Box - Spanska", 499),
  ], [etb], state);
  assert.deepEqual(deals.map((d) => d.listing.id), ["1"]);
});

test("tradera SOAP result parses", () => {
  const xml = `<soap:Envelope><soap:Body><SearchAdvancedResponse><SearchAdvancedResult>
    <TotalNumberOfItems>640</TotalNumberOfItems>
    <Items><Id>42</Id><ShortDescription>Pokémon ETB &amp; more</ShortDescription><BuyItNowPrice>1552</BuyItNowPrice>
    <NextBid>1552</NextBid><EndDate>2027-01-01T12:43:00</EndDate><ItemUrl>https://www.tradera.com/item/1/42/x</ItemUrl><BidCount>0</BidCount></Items>
    </SearchAdvancedResult></SearchAdvancedResponse></soap:Body></soap:Envelope>`;
  const r = parseSearch(xml);
  assert.equal(r.total, 640);
  assert.deepEqual([r.items[0].id, r.items[0].title, r.items[0].buyNow], ["42", "Pokémon ETB & more", 1552]);
});

test("sealed-only: seller description decides", () => {
  const t = "Pitch Black | Elite Trainer Box | Pokémonkort";
  assert.ok(!isSealedListing(t, "Endast plockat ut Card Sleeves och de bästa korten från boosterpaketen i boxen."));
  assert.ok(!isSealedListing(t, "Säljer en ÖPPNAD Elite Trainer Box"));
  assert.ok(!isSealedListing(t, "Fin box, snabb leverans"));
  assert.ok(isSealedListing(t, "Helt ny, oöppnad och inplastad."));
});

test("item page description is decoded", () => {
  const html = `<script>{"@type":"Product","description":"S\\u0026#228;ljer en \\u0026#214;PPNAD box.\\u003Cbr /\\u003EEndast plockat"}</script>`;
  const d = parseDescription(html);
  assert.match(d, /Säljer en ÖPPNAD box/);
  assert.match(d, /Endast plockat/);
});

test("spread: median ask vs lowest shop price", async () => {
  const { spreadRows } = await import("../src/spread.ts");
  const rows = spreadRows([
    listing("1", "Delta Reign Elite Trainer Box", 1200),
    listing("2", "Delta Reign Elite Trainer Box ny", 1400),
    listing("3", "TOM Delta Reign Elite Trainer Box", 50),
    listing("4", "Delta Reign Elite Trainer Box", 1600),
  ], [etb], state);
  assert.deepEqual(rows[0], { name: "Delta Reign ETB", shop: 849, shopName: "Webhallen", shopUrl: "https://shop.test/p", n: 3, low: 1200, median: 1400, pct: 65 });
});

test("minDiscount: 15% means 849 ref needs <= 721 kr", () => {
  const ls = [listing("1", "Delta Reign Elite Trainer Box", 799), listing("2", "Delta Reign Elite Trainer Box", 720)];
  assert.deepEqual(findDeals(ls, [etb], state, 0.15).map((d) => d.listing.id), ["2"]);
});

test("cardmarket: cheapest-trend English product becomes the reference when lower than shops", async () => {
  const { buildIndex, cmMatch } = await import("../src/cardmarket.ts");
  const index = buildIndex(
    { products: [
      { idProduct: 1, name: "Delta Reign Elite Trainer Box" },
      { idProduct: 2, name: "Delta Reign 10 Elite Trainer Box Case" },
      { idProduct: 3, name: "Delta Reign JP Elite Trainer Box" },
    ] },
    { createdAt: "2026-11-03", priceGuides: [
      { idProduct: 1, trend: 70, low: 60 }, { idProduct: 2, trend: 5, low: 5 }, { idProduct: 3, trend: 1, low: 1 },
    ] },
    11,
  );
  assert.equal(cmMatch(index, ["delta reign", "elite trainer box$"])?.id, 1); // case + JP excluded
  const ref = reference(state, etb, { index, shippingSek: 50 });
  assert.equal(ref?.price, 820); // 70 € * 11 + 50 kr < 849 kr Webhallen
  assert.match(ref!.shop, /Cardmarket/);
});

test("formatFlips: keeps real gaps only, best first, clickable", async () => {
  const { formatFlips } = await import("../src/spread.ts");
  const row = (name: string, pct: number | null, n: number) =>
    ({ name, shop: 1000, shopName: "Webhallen", shopUrl: "https://shop.test/p", n, low: 1, median: 1000 + (pct ?? 0) * 10, pct });
  const out = formatFlips([row("Low", 10, 5), row("Lonely", 300, 1), row("Mid", 40, 3), row("Top", 80, 2), row("None", null, 0)]);
  assert.ok(out.indexOf("Top") < out.indexOf("Mid"));
  assert.ok(!/Low|Lonely|None/.test(out));
  assert.match(out, /Buy \*\*1\u00a0000 kr\*\* at \[Webhallen\]\(https:\/\/shop\.test\/p\)/);
  assert.match(out, /\[Tradera\]\(https:\/\/www\.tradera\.com\/search\?q=Top\)/);
  assert.equal(formatFlips([row("Low", 5, 5)]), "Nothing worth flipping this week.");
});

test("maxBuy: listings above the budget are never deals", () => {
  const ls = [listing("1", "Delta Reign Elite Trainer Box", 600)];
  assert.equal(findDeals(ls, [etb], state, 0.25).length, 1);
  assert.equal(findDeals(ls, [etb], state, 0.25, null, 500).length, 0);
});

test("reference ignores out-of-stock shop prices", () => {
  const soldOut: State = { Webhallen: { a: { ...s("Pokemon ME06 Delta Reign Elite Trainer Box", 849), inStock: false } } };
  assert.equal(reference(soldOut, etb), null);
});
