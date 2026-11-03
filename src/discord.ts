import type { Alert } from "./types.ts";

const LABEL = {
  restock: { text: "🔁 BACK IN STOCK", color: 0x2ecc71 },
  new: { text: "🆕 NEW LISTING", color: 0x3498db },
};

export function toPayload(alerts: Alert[], mention = "") {
  return {
    content: mention || undefined,
    allowed_mentions: { parse: ["everyone", "roles"] },
    embeds: alerts.map(({ kind, product: p }) => ({
      title: p.title.slice(0, 250),
      url: p.url,
      color: LABEL[kind].color,
      author: { name: `${LABEL[kind].text} · ${p.shop}` },
      description: [
        p.price != null ? `**${p.price.toLocaleString("sv-SE")} kr**` : "price n/a",
        p.inStock ? "buyable now" : "not buyable yet",
      ].join(" · "),
      thumbnail: p.image ? { url: p.image } : undefined,
    })),
  };
}

export async function sendDiscord(webhook: string, alerts: Alert[], mention?: string) {
  for (let i = 0; i < alerts.length; i += 10) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toPayload(alerts.slice(i, i + 10), i === 0 ? mention : "")),
    });
    if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  }
}
