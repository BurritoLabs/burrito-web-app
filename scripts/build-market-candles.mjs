import fs from "node:fs/promises";
import path from "node:path";

const LCD = process.env.LCD_URL?.trim() || "https://terra-classic-lcd.publicnode.com";
const CHAIN_ID = "columbus-5";

const DEFAULT_INDEX_FILE = path.resolve(process.cwd(), "public", "market", "index.json");
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), "public", "market", "candles");
const HEXXAGON_TOKENS_URL =
  "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main/cw20/tokens/mainnet/terra.js";

const BUCKET_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const LOOKBACK_BUCKETS = {
  "1h": 120,
  "24h": 120,
  "7d": 120,
};

const MAX_LOOKBACK_MS = Math.max(
  ...Object.entries(BUCKET_MS).map(([tf, bucketMs]) => bucketMs * LOOKBACK_BUCKETS[tf])
);

const readArg = (name, fallback) => {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const INDEX_FILE = path.resolve(process.cwd(), readArg("index", DEFAULT_INDEX_FILE));
const OUT_DIR = path.resolve(process.cwd(), readArg("out-dir", DEFAULT_OUT_DIR));
const MAX_PAGES = toInt(readArg("max-pages", process.env.MARKET_CANDLE_MAX_PAGES), 120);
const PAGE_LIMIT = toInt(readArg("page-limit", process.env.MARKET_CANDLE_PAGE_LIMIT), 100);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, retries = 2) => {
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt > retries) break;
      await sleep(250 * attempt);
    }
  }

  throw lastError ?? new Error("Unknown fetch failure");
};

const parseCommonJsArray = (source) => {
  const normalized = source.replace(/^\uFEFF/, "").trim();
  if (!/^module\.exports\s*=/.test(normalized)) {
    throw new Error("Unsupported CJS format");
  }
  const expression = normalized
    .replace(/^module\.exports\s*=\s*/, "")
    .replace(/;\s*$/, "");
  // Trusted remote source from chain-registry.
  const value = new Function(`return (${expression})`)();
  if (!Array.isArray(value)) {
    throw new Error("Expected array payload");
  }
  return value;
};

const normalizeAssetKey = (value) => {
  if (!value) return "";
  if (value.startsWith("ibc/")) return `ibc/${value.slice(4).toUpperCase()}`;
  if (value.startsWith("terra1")) return value.toLowerCase();
  return value.toLowerCase();
};

const normalizeAssetId = (value) => {
  if (!value) return "native:unknown";
  if (value.startsWith("native:") || value.startsWith("cw20:")) return value;
  if (value.startsWith("terra1")) return `cw20:${value.toLowerCase()}`;
  return `native:${value}`;
};

const toAssetMeta = (assetId, cw20Decimals) => {
  const normalized = normalizeAssetId(assetId);

  if (normalized.startsWith("native:")) {
    const denom = normalized.slice("native:".length);
    const key = normalizeAssetKey(denom);
    const decimals = cw20Decimals.get(key) ?? 6;
    return { key, decimals };
  }

  const contract = normalized.slice("cw20:".length).toLowerCase();
  const key = normalizeAssetKey(contract);
  const decimals = cw20Decimals.get(key) ?? 6;
  return { key, decimals };
};

const buildCandles = ({ ticks, bucketMs, lookbackBuckets, now, maxCandles }) => {
  const lookbackStart = now - bucketMs * lookbackBuckets;
  const sorted = [...ticks]
    .filter((tick) => tick.timestamp >= lookbackStart)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!sorted.length) return [];

  const buckets = new Map();
  for (const tick of sorted) {
    const bucketStart = Math.floor(tick.timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        bucketStart,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volumeQuote: tick.volumeQuote,
      });
      continue;
    }
    existing.high = Math.max(existing.high, tick.price);
    existing.low = Math.min(existing.low, tick.price);
    existing.close = tick.price;
    existing.volumeQuote += tick.volumeQuote;
  }

  const firstBucket = Math.floor(lookbackStart / bucketMs) * bucketMs;
  const lastBucket = Math.floor(now / bucketMs) * bucketMs;
  const candles = [];
  let previousClose = sorted[0].price;

  for (let bucketStart = firstBucket; bucketStart <= lastBucket; bucketStart += bucketMs) {
    const candle = buckets.get(bucketStart);
    if (candle) {
      candles.push(candle);
      previousClose = candle.close;
      continue;
    }

    candles.push({
      bucketStart,
      open: previousClose,
      high: previousClose,
      low: previousClose,
      close: previousClose,
      volumeQuote: 0,
    });
  }

  return candles.slice(-maxCandles);
};

const parseTxEvents = (response) => {
  const timestamp = Date.parse(response?.timestamp ?? "");
  if (!Number.isFinite(timestamp)) return [];

  const ticks = [];
  const events = Array.isArray(response?.events) ? response.events : [];

  for (const event of events) {
    if (event?.type !== "wasm") continue;
    const attrs = Array.isArray(event?.attributes) ? event.attributes : [];
    const getAttr = (key) => attrs.find((item) => item?.key === key)?.value;

    const pair = String(getAttr("_contract_address") ?? "").toLowerCase();
    if (!pair) continue;

    const offerAsset = String(getAttr("offer_asset") ?? "");
    const askAsset = String(getAttr("ask_asset") ?? "");
    const offerAmount = Number(getAttr("offer_amount") ?? Number.NaN);
    const returnAmount = Number(getAttr("return_amount") ?? Number.NaN);

    if (!offerAsset || !askAsset) continue;
    if (!Number.isFinite(offerAmount) || !Number.isFinite(returnAmount)) continue;
    if (offerAmount <= 0 || returnAmount <= 0) continue;

    ticks.push({
      timestamp,
      pair,
      offerAsset: normalizeAssetKey(offerAsset),
      askAsset: normalizeAssetKey(askAsset),
      offerAmount,
      returnAmount,
    });
  }

  return ticks;
};

const toTickForOrientation = ({
  row,
  leftKey,
  rightKey,
  leftDecimals,
  rightDecimals,
}) => {
  if (row.offerAsset === leftKey && row.askAsset === rightKey) {
    const offer = row.offerAmount / 10 ** leftDecimals;
    const ret = row.returnAmount / 10 ** rightDecimals;
    if (offer <= 0 || ret <= 0) return null;
    return {
      timestamp: row.timestamp,
      price: ret / offer,
      volumeQuote: ret,
    };
  }

  if (row.offerAsset === rightKey && row.askAsset === leftKey) {
    const offer = row.offerAmount / 10 ** rightDecimals;
    const ret = row.returnAmount / 10 ** leftDecimals;
    if (offer <= 0 || ret <= 0) return null;
    return {
      timestamp: row.timestamp,
      price: offer / ret,
      volumeQuote: offer,
    };
  }

  return null;
};

const loadCw20Decimals = async () => {
  const source = await fetchJson(HEXXAGON_TOKENS_URL);
  const payload = Array.isArray(source)
    ? source
    : parseCommonJsArray(typeof source === "string" ? source : "");

  const map = new Map();
  for (const token of payload) {
    const idRaw = typeof token?.token === "string" ? token.token : "";
    const decimalsRaw = token?.decimals;
    const decimals = Number.isFinite(Number(decimalsRaw)) ? Number(decimalsRaw) : null;
    if (!idRaw || decimals === null) continue;
    const key = normalizeAssetKey(idRaw);
    if (!key || map.has(key)) continue;
    map.set(key, decimals);
  }
  return map;
};

const fetchCw20Decimals = async () => {
  const response = await fetch(HEXXAGON_TOKENS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load cw20 tokens: HTTP ${response.status}`);
  const source = await response.text();
  const payload = parseCommonJsArray(source);

  const map = new Map();
  for (const token of payload) {
    const idRaw = typeof token?.token === "string" ? token.token : "";
    const decimalsRaw = token?.decimals;
    const decimals = Number.isFinite(Number(decimalsRaw)) ? Number(decimalsRaw) : null;
    if (!idRaw || decimals === null) continue;
    const key = normalizeAssetKey(idRaw);
    if (!key || map.has(key)) continue;
    map.set(key, decimals);
  }

  return map;
};

const loadPairMeta = async () => {
  const source = await fs.readFile(INDEX_FILE, "utf8");
  const payload = JSON.parse(source);
  const cw20Decimals = await fetchCw20Decimals();

  const map = new Map();
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];

  for (const pair of pairs) {
    const pairAddress = typeof pair?.pair === "string" ? pair.pair.toLowerCase() : "";
    const poolAssets = Array.isArray(pair?.poolAssets) ? pair.poolAssets : [];
    if (!pairAddress || poolAssets.length < 2) continue;

    const leftAsset = toAssetMeta(poolAssets[0]?.id ?? "", cw20Decimals);
    const rightAsset = toAssetMeta(poolAssets[1]?.id ?? "", cw20Decimals);
    if (!leftAsset.key || !rightAsset.key) continue;

    const leftToRightKey = `${leftAsset.key}|${rightAsset.key}`;
    const rightToLeftKey = `${rightAsset.key}|${leftAsset.key}`;

    map.set(pairAddress, {
      pair: pairAddress,
      leftKey: leftAsset.key,
      rightKey: rightAsset.key,
      leftDecimals: leftAsset.decimals,
      rightDecimals: rightAsset.decimals,
      keys: [leftToRightKey, rightToLeftKey],
    });
  }

  return map;
};

const fetchSwapTxPage = async (page) => {
  const url = new URL(`${LCD}/cosmos/tx/v1beta1/txs`);
  url.searchParams.set("events", "wasm.action='swap'");
  url.searchParams.set("order_by", "2");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));

  const payload = await fetchJson(url.toString());
  return Array.isArray(payload?.tx_responses) ? payload.tx_responses : [];
};

const clearDirectory = async (dir) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(dir, entry.name), { recursive: true, force: true })
      )
    );
  } catch {
    // Ignore if folder does not exist yet.
  }
};

const run = async () => {
  const startedAt = Date.now();
  const now = Date.now();
  const oldestAllowed = now - MAX_LOOKBACK_MS;

  const pairMetaMap = await loadPairMeta();
  const pairTicks = new Map();
  for (const meta of pairMetaMap.values()) {
    pairTicks.set(meta.pair, {
      [meta.keys[0]]: [],
      [meta.keys[1]]: [],
    });
  }

  let scannedTx = 0;
  let matchedEvents = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const txs = await fetchSwapTxPage(page);
    if (!txs.length) break;

    scannedTx += txs.length;
    let oldestOnPage = Number.POSITIVE_INFINITY;

    for (const tx of txs) {
      const rows = parseTxEvents(tx);
      if (!rows.length) continue;

      for (const row of rows) {
        oldestOnPage = Math.min(oldestOnPage, row.timestamp);
        if (row.timestamp < oldestAllowed) continue;

        const meta = pairMetaMap.get(row.pair);
        if (!meta) continue;

        const store = pairTicks.get(row.pair);
        if (!store) continue;

        const forwardTick = toTickForOrientation({
          row,
          leftKey: meta.leftKey,
          rightKey: meta.rightKey,
          leftDecimals: meta.leftDecimals,
          rightDecimals: meta.rightDecimals,
        });
        if (forwardTick) {
          store[meta.keys[0]].push(forwardTick);
          matchedEvents += 1;
        }

        const reverseTick = toTickForOrientation({
          row,
          leftKey: meta.rightKey,
          rightKey: meta.leftKey,
          leftDecimals: meta.rightDecimals,
          rightDecimals: meta.leftDecimals,
        });
        if (reverseTick) {
          store[meta.keys[1]].push(reverseTick);
          matchedEvents += 1;
        }
      }
    }

    const reachedLookback = Number.isFinite(oldestOnPage) && oldestOnPage < oldestAllowed;
    if (reachedLookback || txs.length < PAGE_LIMIT) {
      break;
    }

    if (page % 10 === 0) {
      console.log(`scanned ${page} pages (${scannedTx} tx)`);
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await clearDirectory(OUT_DIR);

  let filesWritten = 0;
  for (const meta of pairMetaMap.values()) {
    const store = pairTicks.get(meta.pair);
    if (!store) continue;

    const candlesByTf = {
      "1h": {},
      "24h": {},
      "7d": {},
    };

    for (const tf of Object.keys(BUCKET_MS)) {
      const bucketMs = BUCKET_MS[tf];
      const lookbackBuckets = LOOKBACK_BUCKETS[tf];

      for (const key of meta.keys) {
        const ticks = store[key] ?? [];
        if (!ticks.length) continue;

        const candles = buildCandles({
          ticks,
          bucketMs,
          lookbackBuckets,
          now,
          maxCandles: LOOKBACK_BUCKETS[tf],
        });

        if (candles.length) {
          candlesByTf[tf][key] = candles;
        }
      }
    }

    if (
      !Object.keys(candlesByTf["1h"]).length &&
      !Object.keys(candlesByTf["24h"]).length &&
      !Object.keys(candlesByTf["7d"]).length
    ) {
      continue;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      chainId: CHAIN_ID,
      lcd: LCD,
      pair: meta.pair,
      candles: candlesByTf,
    };

    const outFile = path.join(OUT_DIR, `${meta.pair}.json`);
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(outFile, `${JSON.stringify(payload)}\n`, "utf8");
    filesWritten += 1;
  }

  console.log(`\nFinished market candles build`);
  console.log(`- Pair metadata: ${pairMetaMap.size}`);
  console.log(`- Scanned tx: ${scannedTx}`);
  console.log(`- Matched swap ticks: ${matchedEvents}`);
  console.log(`- Candle files: ${filesWritten}`);
  console.log(`- Output: ${OUT_DIR}`);
  console.log(`- Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
};

run().catch((error) => {
  console.error("Failed to build market candles:", error);
  process.exit(1);
});
