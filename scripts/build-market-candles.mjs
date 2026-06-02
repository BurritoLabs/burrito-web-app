import fs from "node:fs/promises";
import path from "node:path";
import JSON5 from "json5";

const LCD = process.env.LCD_URL?.trim() || "https://terra-classic-lcd.publicnode.com";
const CHAIN_ID = "columbus-5";

const DEFAULT_INDEX_FILE = path.resolve(process.cwd(), "public", "market", "index.json");
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), "public", "market", "candles");
const HEXXAGON_TOKENS_URL =
  "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main/cw20/tokens/mainnet/terra.js";

const BUCKET_MS = {
  "1h": 60 * 1000,
  "24h": 30 * 60 * 1000,
  "7d": 2 * 60 * 60 * 1000,
};

const LOOKBACK_BUCKETS = {
  "1h": 60,
  "24h": 48,
  "7d": 84,
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

const toPositiveIntOrAll = (value, fallback) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "all") return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const INDEX_FILE = path.resolve(process.cwd(), readArg("index", DEFAULT_INDEX_FILE));
const OUT_DIR = path.resolve(process.cwd(), readArg("out-dir", DEFAULT_OUT_DIR));
const MAX_PAGES = toInt(readArg("max-pages", process.env.MARKET_CANDLE_MAX_PAGES), 120);
const PAGE_LIMIT = toInt(readArg("page-limit", process.env.MARKET_CANDLE_PAGE_LIMIT), 100);
const HOT_PAIR_LIMIT = toPositiveIntOrAll(
  readArg("pair-limit", process.env.MARKET_CANDLE_PAIR_LIMIT),
  100
);
const PAIR_QUERY_CONCURRENCY = toInt(
  readArg("pair-concurrency", process.env.MARKET_CANDLE_PAIR_CONCURRENCY),
  6
);

const TIMEFRAMES = Object.keys(BUCKET_MS);

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

const formatError = (error) =>
  error instanceof Error ? error.message : String(error ?? "unknown error");

const parseCommonJsArray = (source) => {
  const normalized = source.replace(/^\uFEFF/, "").trim();
  if (!/^module\.exports\s*=/.test(normalized)) {
    throw new Error("Unsupported CJS format");
  }
  const expression = normalized
    .replace(/^module\.exports\s*=\s*/, "")
    .replace(/;\s*$/, "");

  let value;
  try {
    value = JSON5.parse(expression);
  } catch (error) {
    throw new Error(`Unsupported CJS payload: ${formatError(error)}`);
  }

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

const parseBigInt = (value) => {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
};

const toUnits = (amount, decimals) => {
  const numeric = Number(amount);
  return Number.isFinite(numeric) ? numeric / 10 ** Math.max(0, decimals) : 0;
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
  const logEvents = Array.isArray(response?.logs)
    ? response.logs.flatMap((log) => (Array.isArray(log?.events) ? log.events : []))
    : [];
  const responseEvents = Array.isArray(response?.events) ? response.events : [];
  const events = logEvents.length ? logEvents : responseEvents;

  for (const event of events) {
    if (event?.type !== "wasm") continue;
    const attrs = Array.isArray(event?.attributes) ? event.attributes : [];
    const getAttr = (key) => attrs.find((item) => item?.key === key)?.value;

    const pair = String(getAttr("_contract_address") ?? "").toLowerCase();
    const action = String(getAttr("action") ?? "").toLowerCase();
    if (!pair) continue;
    if (action !== "swap") continue;

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

const updateBestAnchorQuote = ({
  map,
  targetKey,
  quoteKey,
  targetUnits,
  quoteUnits,
}) => {
  if (!targetKey || !quoteKey) return;
  if (!Number.isFinite(targetUnits) || !Number.isFinite(quoteUnits)) return;
  if (targetUnits <= 0 || quoteUnits <= 0) return;

  const next = {
    quoteKey,
    priceInQuote: quoteUnits / targetUnits,
    liquidityQuote: quoteUnits,
  };
  const current = map.get(targetKey);
  if (!current || next.liquidityQuote > current.liquidityQuote) {
    map.set(targetKey, next);
  }
};

const estimateHotPairs = (pairMetas) => {
  let bestLuncInUstc;
  let bestLuncLiquidity = 0;
  const anchorQuotes = new Map();

  for (const meta of pairMetas) {
    const leftIsUstc = meta.leftKey === "uusd";
    const rightIsUstc = meta.rightKey === "uusd";
    const leftIsLunc = meta.leftKey === "uluna";
    const rightIsLunc = meta.rightKey === "uluna";

    if ((leftIsLunc && rightIsUstc) || (leftIsUstc && rightIsLunc)) {
      const luncUnits = leftIsLunc ? meta.leftUnits : meta.rightUnits;
      const ustcUnits = leftIsUstc ? meta.leftUnits : meta.rightUnits;
      if (luncUnits > 0 && ustcUnits > 0 && ustcUnits > bestLuncLiquidity) {
        bestLuncLiquidity = ustcUnits;
        bestLuncInUstc = ustcUnits / luncUnits;
      }
    }

    if (leftIsUstc || leftIsLunc) {
      updateBestAnchorQuote({
        map: anchorQuotes,
        targetKey: meta.rightKey,
        quoteKey: meta.leftKey,
        targetUnits: meta.rightUnits,
        quoteUnits: meta.leftUnits,
      });
    }
    if (rightIsUstc || rightIsLunc) {
      updateBestAnchorQuote({
        map: anchorQuotes,
        targetKey: meta.leftKey,
        quoteKey: meta.rightKey,
        targetUnits: meta.leftUnits,
        quoteUnits: meta.rightUnits,
      });
    }
  }

  const resolvePriceInUstc = (key) => {
    if (key === "uusd") return 1;
    if (key === "uluna") return bestLuncInUstc;

    const quote = anchorQuotes.get(key);
    if (!quote) return undefined;
    if (quote.quoteKey === "uusd") return quote.priceInQuote;
    if (quote.quoteKey === "uluna" && bestLuncInUstc !== undefined) {
      return quote.priceInQuote * bestLuncInUstc;
    }
    return undefined;
  };

  const ranked = pairMetas
    .map((meta) => {
      const leftPrice = resolvePriceInUstc(meta.leftKey);
      const rightPrice = resolvePriceInUstc(meta.rightKey);
      const leftValue = leftPrice !== undefined ? meta.leftUnits * leftPrice : undefined;
      const rightValue = rightPrice !== undefined ? meta.rightUnits * rightPrice : undefined;
      const score =
        leftValue !== undefined && rightValue !== undefined
          ? leftValue + rightValue
          : leftValue !== undefined
            ? leftValue * 2
            : rightValue !== undefined
              ? rightValue * 2
              : 0;

      return {
        pair: meta.pair,
        score,
      };
    })
    .sort((a, b) => (b.score === a.score ? a.pair.localeCompare(b.pair) : b.score - a.score));

  const orderedPairs = [];
  const seen = new Set();
  const addPair = (pair) => {
    if (!pair || seen.has(pair)) return;
    seen.add(pair);
    orderedPairs.push(pair);
  };

  ranked.forEach((entry) => {
    if (entry.score > 0) addPair(entry.pair);
  });
  pairMetas.forEach((meta) => addPair(meta.pair));

  return {
    orderedPairs,
    scoredPairs: ranked.filter((entry) => entry.score > 0).length,
  };
};

const loadPairMeta = async () => {
  const source = await fs.readFile(INDEX_FILE, "utf8");
  const payload = JSON.parse(source);
  const cw20Decimals = await fetchCw20Decimals();

  const map = new Map();
  const metas = [];
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];

  for (const pair of pairs) {
    const pairAddress = typeof pair?.pair === "string" ? pair.pair.toLowerCase() : "";
    const poolAssets = Array.isArray(pair?.poolAssets) ? pair.poolAssets : [];
    if (!pairAddress || poolAssets.length < 2) continue;

    const leftAsset = toAssetMeta(poolAssets[0]?.id ?? "", cw20Decimals);
    const rightAsset = toAssetMeta(poolAssets[1]?.id ?? "", cw20Decimals);
    if (!leftAsset.key || !rightAsset.key) continue;
    const leftUnits = toUnits(parseBigInt(poolAssets[0]?.amount ?? "0"), leftAsset.decimals);
    const rightUnits = toUnits(parseBigInt(poolAssets[1]?.amount ?? "0"), rightAsset.decimals);

    const leftToRightKey = `${leftAsset.key}|${rightAsset.key}`;
    const rightToLeftKey = `${rightAsset.key}|${leftAsset.key}`;

    const meta = {
      pair: pairAddress,
      leftKey: leftAsset.key,
      rightKey: rightAsset.key,
      leftDecimals: leftAsset.decimals,
      rightDecimals: rightAsset.decimals,
      leftUnits,
      rightUnits,
      keys: [leftToRightKey, rightToLeftKey],
    };

    map.set(pairAddress, meta);
    metas.push(meta);
  }

  const { orderedPairs, scoredPairs } = estimateHotPairs(metas);
  const limitedPairs = Number.isFinite(HOT_PAIR_LIMIT)
    ? orderedPairs.slice(0, HOT_PAIR_LIMIT)
    : orderedPairs;

  return {
    pairMetaMap: map,
    selectedPairs: limitedPairs,
    scoredPairs,
  };
};

const fetchPairTxPage = async (pairAddress, page) => {
  const url = new URL(`${LCD}/cosmos/tx/v1beta1/txs`);
  url.searchParams.set("events", `wasm._contract_address='${pairAddress}'`);
  url.searchParams.set("order_by", "2");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));

  const payload = await fetchJson(url.toString());
  return Array.isArray(payload?.tx_responses) ? payload.tx_responses : [];
};

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = [];
  let cursor = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const result = await mapper(items[index], index);
        if (result !== undefined && result !== null) {
          results.push(result);
        }
      }
    }
  );

  await Promise.all(workers);
  return results;
};

const summarizeCandleVolumes = (candlesByTf) => {
  const summary = {};

  for (const tf of TIMEFRAMES) {
    const byKey = candlesByTf[tf];
    if (!byKey || typeof byKey !== "object") continue;

    const totals = Object.entries(byKey).reduce((acc, [key, candles]) => {
      if (!Array.isArray(candles) || !candles.length) return acc;
      const total = candles.reduce((sum, candle) => {
        const volume = Number(candle?.volumeQuote ?? 0);
        return Number.isFinite(volume) && volume > 0 ? sum + volume : sum;
      }, 0);

      if (Number.isFinite(total) && total >= 0) {
        acc[key] = total;
      }
      return acc;
    }, {});

    if (Object.keys(totals).length) {
      summary[tf] = totals;
    }
  }

  return summary;
};

const mergeVolumeSummariesIntoIndex = async ({ indexFile, refreshedPairs, volumesByPair }) => {
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(indexFile, "utf8"));
  } catch {
    return 0;
  }

  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : null;
  if (!pairs) return 0;

  let updated = 0;
  payload.pairs = pairs.map((entry) => {
    const pair = typeof entry?.pair === "string" ? entry.pair.toLowerCase() : "";
    if (!pair) return entry;
    if (!refreshedPairs.has(pair)) return entry;

    const next = { ...entry };
    const volumes = volumesByPair.get(pair);

    if (volumes && Object.keys(volumes).length) {
      next.volumes = volumes;
      updated += 1;
      return next;
    }

    if ("volumes" in next) {
      delete next.volumes;
    }
    return next;
  });

  await fs.writeFile(indexFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return updated;
};

const collectPairTicks = async ({ meta, oldestAllowed }) => {
  const store = {
    [meta.keys[0]]: [],
    [meta.keys[1]]: [],
  };

  let scannedTx = 0;
  let matchedEvents = 0;
  let fetchErrors = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let txs;
    try {
      txs = await fetchPairTxPage(meta.pair, page);
    } catch (error) {
      fetchErrors += 1;
      console.warn(
        `[warn] ${meta.pair} page ${page} tx fetch failed after retries: ${formatError(error)}`
      );
      break;
    }

    if (!txs.length) break;

    scannedTx += txs.length;
    let oldestOnPage = Number.POSITIVE_INFINITY;

    for (const tx of txs) {
      const rows = parseTxEvents(tx);
      if (!rows.length) continue;

      for (const row of rows) {
        if (row.pair !== meta.pair) continue;

        oldestOnPage = Math.min(oldestOnPage, row.timestamp);
        if (row.timestamp < oldestAllowed) continue;

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
  }

  return {
    pair: meta.pair,
    store,
    scannedTx,
    matchedEvents,
    fetchErrors,
  };
};

const run = async () => {
  const startedAt = Date.now();
  const now = Date.now();
  const oldestAllowed = now - MAX_LOOKBACK_MS;

  const { pairMetaMap, selectedPairs, scoredPairs } = await loadPairMeta();
  const selectedMetas = selectedPairs
    .map((pair) => pairMetaMap.get(pair))
    .filter(Boolean);

  const pairResults = await mapWithConcurrency(
    selectedMetas,
    PAIR_QUERY_CONCURRENCY,
    async (meta, index) => {
      let result;
      try {
        result = await collectPairTicks({ meta, oldestAllowed });
      } catch (error) {
        console.warn(
          `[warn] ${meta.pair} candle collection failed: ${formatError(error)}`
        );
        result = {
          pair: meta.pair,
          store: {
            [meta.keys[0]]: [],
            [meta.keys[1]]: [],
          },
          scannedTx: 0,
          matchedEvents: 0,
          fetchErrors: 1,
        };
      }
      console.log(
        `[${index + 1}/${selectedMetas.length}] ${meta.pair} -> ${result.matchedEvents} ticks from ${result.scannedTx} tx`
      );
      return result;
    }
  );

  const pairTicks = new Map(pairResults.map((result) => [result.pair, result.store]));
  const pairResultMap = new Map(pairResults.map((result) => [result.pair, result]));
  const refreshedPairs = new Set(
    pairResults.filter((result) => result.fetchErrors === 0).map((result) => result.pair)
  );
  const scannedTx = pairResults.reduce((sum, result) => sum + result.scannedTx, 0);
  const matchedEvents = pairResults.reduce((sum, result) => sum + result.matchedEvents, 0);
  const fetchErrors = pairResults.reduce((sum, result) => sum + result.fetchErrors, 0);

  await fs.mkdir(OUT_DIR, { recursive: true });

  let filesWritten = 0;
  const volumeSummaries = new Map();
  for (const meta of selectedMetas) {
    const result = pairResultMap.get(meta.pair);
    if (!result || result.fetchErrors > 0) continue;

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

    const volumeSummary = summarizeCandleVolumes(candlesByTf);
    if (Object.keys(volumeSummary).length) {
      volumeSummaries.set(meta.pair, volumeSummary);
    }

    const outFile = path.join(OUT_DIR, `${meta.pair}.json`);
    await fs.writeFile(outFile, `${JSON.stringify(payload)}\n`, "utf8");
    filesWritten += 1;
  }

  const indexVolumesUpdated = await mergeVolumeSummariesIntoIndex({
    indexFile: INDEX_FILE,
    refreshedPairs,
    volumesByPair: volumeSummaries,
  });

  console.log(`\nFinished market candles build`);
  console.log(`- Pair metadata: ${pairMetaMap.size}`);
  console.log(`- Hot pairs selected: ${selectedMetas.length}`);
  console.log(`- Hot pairs with liquidity score: ${scoredPairs}`);
  console.log(`- Hot pairs refreshed: ${refreshedPairs.size}`);
  console.log(`- Scanned tx: ${scannedTx}`);
  console.log(`- Matched swap ticks: ${matchedEvents}`);
  console.log(`- Pair tx fetch errors: ${fetchErrors}`);
  console.log(`- Candle files: ${filesWritten}`);
  console.log(`- Index volume summaries: ${indexVolumesUpdated}`);
  console.log(`- Output: ${OUT_DIR}`);
  console.log(`- Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
};

run().catch((error) => {
  console.error("Failed to build market candles:", error);
  process.exit(1);
});
