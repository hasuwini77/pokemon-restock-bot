import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlphaspel } from "../src/shops/alphaspel.ts";
import { parseShopify } from "../src/shops/dragonslair.ts";
import { parseSfbok } from "../src/shops/sfbok.ts";
import { parseWebhallen } from "../src/shops/webhallen.ts";

// Fixtures trimmed from real responses on 2026-11-03.
test("webhallen: web or store stock counts as in stock, non-TCG dropped", () => {
  const json = JSON.stringify({
    totalProductCount: 3,
    products: [
      { id: 1, name: "Pokemon ETB", categoryTree: "Leksaker & Hobby/Samlarkortspel/Pokémon", price: { price: "849.00" }, stock: { web: 0, "5": 2 } },
      { id: 2, name: "Pokemon Display", categoryTree: "Leksaker & Hobby/Samlarkortspel/Pokémon", price: { price: "2299.00" }, stock: { web: 0, "5": 0, webStock: { "5": 9 } } },
      { id: 3, name: "Pokemon Plush", categoryTree: "Leksaker/Merchandise/Pokemon", stock: { web: 9 } },
    ],
  });
  const { products, total } = parseWebhallen(json);
  assert.equal(total, 3);
  assert.deepEqual(products.map((p) => [p.id, p.inStock, p.price]), [["1", true, 849], ["2", false, 2299]]);
});

test("shopify: any available variant = in stock", () => {
  const json = JSON.stringify({ products: [
    { id: 9, title: "Pokémon ETB", handle: "etb", variants: [{ price: "995.00", available: false }, { price: "995.00", available: true }] },
  ] });
  const [p] = parseShopify(json, "Dragon's Lair", "https://dragonslair.se");
  assert.deepEqual([p.id, p.inStock, p.price, p.url], ["9", true, 995, "https://dragonslair.se/products/etb"]);
});

test("alphaspel: disabled cart button = not buyable", () => {
  const card = (id: string, disabled: boolean) => `<div class="product">
    <a href="/1762-pokemon-tcg/${id}-x"><img class="img-fluid" src="/media/x.png" alt=""></a>
    <div class="product-name">Pokemon TCG: Booster Bundle &amp; Co
    <small></small></div>
    <div class="price text-success">
      1 299 kr
    </div>
    <a rel="nofollow" class="btn w-100 btn-default ${disabled ? "disabled " : ""}add-to-cart" href="/checkout/add/${id}">Köp</a>`;
  const ps = parseAlphaspel("<html>" + card("11", true) + card("12", false));
  assert.deepEqual(ps.map((p) => [p.id, p.inStock, p.price, p.title]), [
    ["11", false, 1299, "Pokemon TCG: Booster Bundle & Co"],
    ["12", true, 1299, "Pokemon TCG: Booster Bundle & Co"],
  ]);
});

test("sfbok: escaped RSC payload", () => {
  const raw = `\\"displayName\\":\\"Pokemon TCG: Abyss Eye M5 Booster\\",\\"slug\\":\\"abyss-eye\\",\\"skuCode\\":\\"746893\\",\\"price\\":{\\"bestPriceInclVat\\":95},\\"stockStatus\\":0,\\"stockQuantity\\":0`;
  const [p] = parseSfbok(raw);
  assert.deepEqual([p.id, p.inStock, p.price], ["746893", false, 95]);
  assert.match(p.url, /\/746893\/abyss-eye$/);
});
