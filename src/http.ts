const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "sv-SE,sv;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
