// Sealed products worth flipping. Title must mention Pokémon AND one of these.
const SEALED =
  /booster|display|elite trainer|\betb\b|bundle|ultra[- ]premium|\bupc\b|premium collection|collection box|special collection|\btin\b|blister|build ?& ?battle|starter deck|\bbox\b/i;
const EXCLUDE =
  /plush|funko|pärm|binder|portfolio|\bsleeves?\b|deck ?box|playmat|spelmatta|toploader|deltagarbiljett|biljett|kalender|figurer?\b|pussel|monopoly|kläder|t-shirt|mugg/i;

export function isWatched(title: string): boolean {
  return /pok[eé]mon/i.test(title) && SEALED.test(title) && !EXCLUDE.test(title);
}
