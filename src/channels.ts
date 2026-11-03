import { isWatched, isWatchedMtg } from "./filter.ts";
import { alphaspel } from "./shops/alphaspel.ts";
import { dragonslair } from "./shops/dragonslair.ts";
import { sfbok } from "./shops/sfbok.ts";
import { webhallen } from "./shops/webhallen.ts";
import type { Product } from "./types.ts";

export interface Channel {
  id: string;
  shops: Record<string, () => Promise<Product[]>>;
  watch: (title: string) => boolean;
  stateFile: string;
  webhook?: string;
  mention?: string;
  priority: RegExp; // titles that get a ⭐
  tradera?: { appId?: string; appKey?: string; dealsFile: string; stateFile: string };
}

const env = process.env;

export const channels: Channel[] = [
  {
    id: "pokemon",
    shops: {
      Webhallen: () => webhallen(),
      "Dragon's Lair": () => dragonslair(),
      Alphaspel: () => alphaspel(),
      "SF Bok": () => sfbok(),
    },
    watch: isWatched,
    stateFile: env.STATE_FILE ?? "state.json",
    webhook: env.DISCORD_WEBHOOK_URL,
    mention: env.DISCORD_MENTION,
    priority: /30th|30[- ]?år|anniversary/i,
    tradera: {
      appId: env.TRADERA_APP_ID,
      appKey: env.TRADERA_APP_KEY,
      dealsFile: "deals.json",
      stateFile: env.TRADERA_STATE_FILE ?? "tradera-state.json",
    },
  },
  {
    id: "mtg",
    shops: {
      Webhallen: () => webhallen("magic the gathering", /Samlarkortspel\/Magic/i),
      "Dragon's Lair": () => dragonslair("magic-the-gathering"),
      Alphaspel: () => alphaspel("/1982-boosters-displayer-och-bundles/"),
      "SF Bok": () => sfbok("/sv/spel/samlarkortspel-tcg-ccg/magic-the-gathering"),
    },
    watch: isWatchedMtg,
    stateFile: env.MTG_STATE_FILE ?? "state-mtg.json",
    webhook: env.DISCORD_MTG_WEBHOOK_URL,
    mention: env.DISCORD_MTG_MENTION,
    priority: /collector/i,
    // Own Tradera app = own 100 calls/day. Enabled once deals-mtg.json + keys exist.
    tradera: {
      appId: env.TRADERA_MTG_APP_ID,
      appKey: env.TRADERA_MTG_APP_KEY,
      dealsFile: "deals-mtg.json",
      stateFile: env.TRADERA_MTG_STATE_FILE ?? "tradera-state-mtg.json",
    },
  },
];
