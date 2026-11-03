import { sendDiscord } from "./discord.ts";

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not set");
await sendDiscord(
  webhook,
  [{
    kind: "restock",
    product: {
      shop: "TEST",
      id: "test",
      title: "Test alert: restock bot is wired up",
      url: "https://github.com/hasuwini77/pokemon-restock-bot",
      price: null,
      inStock: true,
    },
  }],
  process.env.DISCORD_MENTION,
);
console.log("test alert sent");
