import fs from "node:fs/promises";
import path from "node:path";

const LCD =
  process.env.LCD_URL?.trim() || "https://terra-classic-lcd.publicnode.com";
const CHAIN_ID = "columbus-5";
const DEFAULT_OUT = path.resolve(process.cwd(), "public", "market", "index.json");

const DEXES = [
  {
    id: "terraswap",
    label: "Terraswap",
    factory: "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0",
    mode: "terraswap",
  },
  {
    id: "terraswap-legacy",
    label: "Terraswap V1",
    factory: "terra1ulgw0td86nvs4wtpsc80thv6xelk76ut7a7apj",
    mode: "terraswap",
  },
  {
    id: "astroport",
    label: "Astroport",
    factory: "terra1fnywlw4edny3vw44x04xd67uzkdqluymgreu7g",
    mode: "astroport",
    pairCodeIds: [1793, 4007, 4156],
  },
  {
    id: "terraport-v2",
    label: "Terraport V2",
    factory:
      "terra1n75fgfc8clsssrm2k0fswgtzsvstdaah7la6sfu96szdu22xta0q57rqqr",
    mode: "terraswap",
  },
  {
    id: "terraport-cpmm",
    label: "Terraport XYK",
    factory: "terra1m8zz7q49x8phrfwc0rxep77l2u6hf7tm2arv2rmzk5c9lg7p6ncqu3y4zg",
    mode: "terraswap",
  },
  {
    id: "terraport-v3",
    label: "Terraport V3",
    factory:
      "terra1y55punu6m5cm8sgqdgt6ngevtyklaylc09qxputn6ksye4ptf9ysxmtyl6",
    mode: "terraswap",
  },
  {
    id: "garuda-v1",
    label: "Garuda DeFi V1",
    factory:
      "terra18srpvety7xz28lw5g0f6cx9sw50hyvk3xk7up80ul4pdpauvq7jq5zcm98",
    mode: "garuda",
  },
  {
    id: "garuda-v2",
    label: "Garuda DeFi V2",
    factory:
      "terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7",
    mode: "garuda",
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, retries = 2) => {
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt > retries) break;
      await sleep(250 * attempt);
    }
  }
  throw lastError ?? new Error("Unknown fetch error");
};

const querySmart = async (contract, query) => {
  const encoded = Buffer.from(JSON.stringify(query)).toString("base64");
  const url = `${LCD}/cosmwasm/wasm/v1/contract/${encodeURIComponent(
    contract
  )}/smart/${encodeURIComponent(encoded)}`;
  const payload = await fetchJson(url);
  return payload?.data ?? payload;
};

const looksLikeTerraAddress = (value) =>
  typeof value === "string" && value.toLowerCase().startsWith("terra1");

const normalizePoolAddress = (value) =>
  typeof value === "string" ? value.toLowerCase() : "";

const toPairEntry = (pairLike) => {
  const pair = normalizePoolAddress(pairLike?.contract_addr ?? pairLike?.contract);
  if (!pair) return null;

  const assetInfos = Array.isArray(pairLike?.asset_infos)
    ? pairLike.asset_infos
    : pairLike?.asset1 && pairLike?.asset2
    ? [pairLike.asset1, pairLike.asset2]
    : undefined;

  return { pair, assetInfos };
};

const mergePairEntries = (entries) => {
  const byPair = new Map();
  for (const entry of entries) {
    if (!entry?.pair) continue;
    const current = byPair.get(entry.pair);
    if (!current) {
      byPair.set(entry.pair, entry);
      continue;
    }
    if (!current.assetInfos && entry.assetInfos) {
      byPair.set(entry.pair, entry);
    }
  }
  return Array.from(byPair.values());
};

const resolveAssetId = (info) => {
  const nativeDenom =
    info?.native_token?.denom ??
    (typeof info?.native === "string" ? info.native : undefined) ??
    (typeof info?.native_denom === "string" ? info.native_denom : undefined);
  if (nativeDenom) return `native:${nativeDenom}`;

  const cw20Addr =
    info?.token?.contract_addr ??
    (typeof info?.token === "string" && looksLikeTerraAddress(info.token)
      ? info.token
      : undefined) ??
    (typeof info?.token_address === "string" ? info.token_address : undefined) ??
    (typeof info?.cw20 === "string" ? info.cw20 : undefined);
  if (cw20Addr) return `cw20:${cw20Addr.toLowerCase()}`;

  return "native:unknown";
};

const toFallbackAsset = (assetId) => {
  if (assetId.startsWith("native:")) return assetId.slice("native:".length);
  if (assetId.startsWith("cw20:")) return assetId.slice("cw20:".length);
  return assetId;
};

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = [];
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      // eslint-disable-next-line no-await-in-loop
      const result = await mapper(items[current], current);
      if (result !== null && result !== undefined) results.push(result);
    }
  });

  await Promise.all(workers);
  return results;
};

const loadContractsByCodeId = async (codeId) => {
  const contracts = [];
  let nextKey = "";

  for (let page = 0; page < 400; page += 1) {
    const url = new URL(`${LCD}/cosmwasm/wasm/v1/code/${codeId}/contracts`);
    url.searchParams.set("pagination.limit", "200");
    if (nextKey) {
      url.searchParams.set("pagination.key", nextKey);
    }

    let payload;
    try {
      // eslint-disable-next-line no-await-in-loop
      payload = await fetchJson(url.toString());
    } catch {
      break;
    }

    const rows = Array.isArray(payload?.contracts) ? payload.contracts : [];
    rows.forEach((contract) => {
      const normalized = normalizePoolAddress(contract);
      if (normalized) contracts.push({ pair: normalized });
    });

    const rawNext = payload?.pagination?.next_key;
    if (!rawNext) break;
    nextKey = rawNext;
  }

  return mergePairEntries(contracts);
};

const loadPairsFromTerraswapFactory = async (factory) => {
  const pairEntries = [];
  const seenCursors = new Set();
  const limit = 30;
  let startAfter = undefined;

  for (let page = 0; page < 300; page += 1) {
    const query = startAfter
      ? { pairs: { limit, start_after: startAfter } }
      : { pairs: { limit } };
    let data;
    try {
      // eslint-disable-next-line no-await-in-loop
      data = await querySmart(factory, query);
    } catch {
      break;
    }
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    if (!pairs.length) break;

    for (const pair of pairs) {
      const entry = toPairEntry(pair);
      if (entry) pairEntries.push(entry);
    }

    const last = pairs[pairs.length - 1];
    const next = Array.isArray(last?.asset_infos) ? last.asset_infos : undefined;
    if (!next || pairs.length < limit) break;
    const cursorKey = JSON.stringify(next);
    if (seenCursors.has(cursorKey)) break;
    seenCursors.add(cursorKey);
    startAfter = next;
  }

  return mergePairEntries(pairEntries);
};

const loadPairsFromGarudaFactory = async (factory) => {
  const pairEntries = [];
  let data;
  try {
    data = await querySmart(factory, { pairs: { limit: 2000 } });
  } catch {
    return [];
  }
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  for (const pair of pairs) {
    const entry = toPairEntry(pair);
    if (entry) pairEntries.push(entry);
  }
  return mergePairEntries(pairEntries);
};

const loadPairsFromAstroportFactory = async (dex) => {
  const pairEntries = await loadPairsFromTerraswapFactory(dex.factory);
  const codeIds = Array.isArray(dex.pairCodeIds) ? dex.pairCodeIds : [];

  if (!codeIds.length) return pairEntries;

  const byCode = await mapWithConcurrency(codeIds, 3, (codeId) => loadContractsByCodeId(codeId));
  const merged = [...pairEntries];
  byCode.forEach((contracts) => merged.push(...(contracts ?? [])));

  return mergePairEntries(merged);
};

const resolvePoolSnapshot = async (pairEntry, dex) => {
  const pairAddress = pairEntry?.pair;
  if (!pairAddress) return null;

  const fromAssetInfos = (assetInfos, leftAmount = "0", rightAmount = "0") => {
    const infos = Array.isArray(assetInfos) ? assetInfos : [];
    if (infos.length < 2) return null;
    const leftId = resolveAssetId(infos[0]);
    const rightId = resolveAssetId(infos[1]);
    return {
      pair: pairAddress,
      dexId: dex.id,
      dexLabel: dex.label,
      type: "xyk",
      assets: [toFallbackAsset(leftId), toFallbackAsset(rightId)],
      poolAssets: [
        { id: leftId, amount: String(leftAmount ?? "0") },
        { id: rightId, amount: String(rightAmount ?? "0") },
      ],
    };
  };

  let data;
  try {
    data = await querySmart(pairAddress, { pool: {} });
  } catch {
    return fromAssetInfos(pairEntry?.assetInfos);
  }

  const assets = Array.isArray(data?.assets) ? data.assets : null;
  if (assets?.length >= 2) {
    return fromAssetInfos(
      [assets[0]?.info, assets[1]?.info],
      assets[0]?.amount ?? "0",
      assets[1]?.amount ?? "0"
    );
  }

  if (data?.asset1 && data?.asset2) {
    return fromAssetInfos(
      [data.asset1, data.asset2],
      data?.reserve1 ?? "0",
      data?.reserve2 ?? "0"
    );
  }

  return fromAssetInfos(pairEntry?.assetInfos);
};

const parseOutArg = () => {
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0 && process.argv[outIndex + 1]) {
    return path.resolve(process.cwd(), process.argv[outIndex + 1]);
  }
  return DEFAULT_OUT;
};

const run = async () => {
  const outFile = parseOutArg();
  const records = [];

  for (const dex of DEXES) {
    const pairEntries =
      dex.mode === "garuda"
        ? // eslint-disable-next-line no-await-in-loop
          await loadPairsFromGarudaFactory(dex.factory)
        : dex.mode === "astroport"
        ? // eslint-disable-next-line no-await-in-loop
          await loadPairsFromAstroportFactory(dex)
        : // eslint-disable-next-line no-await-in-loop
          await loadPairsFromTerraswapFactory(dex.factory);

    console.log(`${dex.label}: discovered ${pairEntries.length} pairs`);

    // eslint-disable-next-line no-await-in-loop
    const snapshots = await mapWithConcurrency(pairEntries, 14, (pairEntry) =>
      resolvePoolSnapshot(pairEntry, dex)
    );

    console.log(`${dex.label}: resolved ${snapshots.length} pool snapshots`);
    records.push(...snapshots);
  }

  const byPair = new Map();
  for (const entry of records) {
    if (!entry?.pair) continue;
    if (!byPair.has(entry.pair)) byPair.set(entry.pair, entry);
  }

  const pairs = Array.from(byPair.values()).sort((a, b) =>
    a.dexLabel === b.dexLabel
      ? a.pair.localeCompare(b.pair)
      : a.dexLabel.localeCompare(b.dexLabel)
  );

  const dexCounts = DEXES.map((dex) => ({
    id: dex.id,
    label: dex.label,
    pairCount: pairs.filter((entry) => entry.dexId === dex.id).length,
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    lcd: LCD,
    chainId: CHAIN_ID,
    pairCount: pairs.length,
    dexes: dexCounts,
    pairs,
  };

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Wrote ${pairs.length} pools -> ${outFile}`);
  console.table(dexCounts);
};

run().catch((error) => {
  console.error("Failed to build market index:", error);
  process.exit(1);
});
