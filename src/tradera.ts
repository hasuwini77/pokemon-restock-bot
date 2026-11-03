// Tradera free API (SOAP v3). Hard limit: 100 calls / 24 h per app.
const ENDPOINT = "https://api.tradera.com/v3/searchservice.asmx";

export interface TraderaItem {
  id: string;
  title: string;
  url: string;
  buyNow: number | null; // SEK
  nextBid: number | null;
  bids: number;
  endDate: string;
  image?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function searchEnvelope(appId: string, appKey: string, req: Record<string, string | number | boolean>) {
  const fields = Object.entries(req).map(([k, v]) => `<${k}>${esc(String(v))}</${k}>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header>
<AuthenticationHeader xmlns="http://api.tradera.com"><AppId>${esc(appId)}</AppId><AppKey>${esc(appKey)}</AppKey></AuthenticationHeader>
</soap:Header><soap:Body><SearchAdvanced xmlns="http://api.tradera.com"><request>${fields}</request></SearchAdvanced></soap:Body></soap:Envelope>`;
}

export function parseSearch(xml: string): { items: TraderaItem[]; total: number; errors: string[] } {
  const tag = (s: string, t: string) => s.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1];
  const num = (v?: string) => (v && Number(v) > 0 ? Number(v) : null);
  const items = [...xml.matchAll(/<Items>([\s\S]*?)<\/Items>/g)].map(([, s]) => ({
    id: tag(s, "Id") ?? "",
    title: unesc(tag(s, "ShortDescription") ?? ""),
    url: unesc(tag(s, "ItemUrl") ?? ""),
    buyNow: num(tag(s, "BuyItNowPrice")),
    nextBid: num(tag(s, "NextBid")),
    bids: Number(tag(s, "BidCount") ?? 0),
    endDate: tag(s, "EndDate") ?? "",
    image: tag(s, "ThumbnailLink"),
  }));
  const errors = [...xml.matchAll(/<Message>([^<]*)<\/Message>/g)].map((m) => unesc(m[1]));
  return { items, total: Number(tag(xml, "TotalNumberOfItems") ?? 0), errors };
}

export async function searchTradera(appId: string, appKey: string, req: Record<string, string | number | boolean>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: '"http://api.tradera.com/SearchAdvanced"' },
    body: searchEnvelope(appId, appKey, req),
    signal: AbortSignal.timeout(20_000),
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`Tradera ${res.status}: ${xml.match(/<faultstring>([^<]*)/)?.[1] ?? xml.slice(0, 200)}`);
  return parseSearch(xml);
}

/** Seller's description from the public item page (the search API doesn't return it). */
export function parseDescription(html: string): string {
  const raw = html.match(/"description":"((?:[^"\\]|\\.)*)"/)?.[1];
  if (!raw) throw new Error("no description on item page");
  return (JSON.parse(`"${raw}"`) as string)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&");
}
