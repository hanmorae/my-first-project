// 환율·주가지수를 Yahoo Finance에서 받아 dashboard/data.json 으로 저장합니다.
// GitHub Actions에서 1시간마다 실행됩니다.
import { readFile, writeFile } from "node:fs/promises";

const OUT = "dashboard/data.json";

const ITEMS = [
  { key: "usdkrw", name: "원/달러", symbol: "KRW=X", unit: "원", digits: 2 },
  { key: "jpykrw", name: "원/100엔", symbol: "JPYKRW=X", unit: "원", digits: 2, multiply: 100 },
  { key: "kospi", name: "코스피", symbol: "^KS11", digits: 2 },
  { key: "kosdaq", name: "코스닥", symbol: "^KQ11", digits: 2 },
  { key: "nasdaq", name: "나스닥", symbol: "^IXIC", digits: 2 },
  { key: "dow", name: "다우존스", symbol: "^DJI", digits: 2 },
];

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error(`${symbol}: 데이터 없음`);
  return {
    price: meta.regularMarketPrice,
    prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
    marketTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

let previous = {};
try {
  previous = JSON.parse(await readFile(OUT, "utf8")).items ?? {};
} catch {}

const items = {};
let ok = 0;
for (const it of ITEMS) {
  try {
    const q = await fetchQuote(it.symbol);
    const m = it.multiply ?? 1;
    const price = q.price * m;
    const prev = q.prevClose != null ? q.prevClose * m : null;
    items[it.key] = {
      name: it.name,
      unit: it.unit ?? "",
      digits: it.digits,
      price,
      change: prev != null ? price - prev : null,
      changePercent: prev ? ((price - prev) / prev) * 100 : null,
      marketTime: q.marketTime,
    };
    ok++;
  } catch (err) {
    console.error(String(err));
    // 실패하면 이전 값을 유지합니다.
    if (previous[it.key]) items[it.key] = { ...previous[it.key], stale: true };
  }
}

if (ok === 0) {
  console.error("모든 데이터 가져오기 실패 — 파일을 바꾸지 않습니다.");
  process.exit(1);
}

await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2) + "\n");
console.log(`저장 완료: ${ok}/${ITEMS.length}개`);
