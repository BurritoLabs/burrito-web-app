import fs from "node:fs/promises";
import path from "node:path";

const LCD =
  process.env.LCD_URL?.trim() || "https://terra-classic-lcd.publicnode.com";
const CHAIN_ID = "columbus-5";
const DEFAULT_OUT = path.resolve(process.cwd(), "public", "market", "index.json");
const MIN_PAIR_COUNT = Number.parseInt(process.env.MARKET_INDEX_MIN_PAIRS ?? "1000", 10);

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
    pairCodeIds: [9789],
  },
  {
    id: "garuda-v2",
    label: "Garuda DeFi V2",
    factory:
      "terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7",
    mode: "garuda",
    pairCodeIds: [10907],
  },
  {
    id: "white-whale",
    label: "White Whale",
    mode: "code-id",
    pairCodeIds: [8710],
  },
  {
    id: "luncswap",
    label: "LUNCSwap.fun",
    mode: "code-id",
    pairCodeIds: [9913],
  },
  {
    id: "terra-pump",
    label: "Terra.pump",
    mode: "terrapump",
    pairCodeIds: [9882, 10495],
  },
  {
    id: "luncpump",
    label: "LUNCPump.fun",
    factory: "terra1szpen6r7eqstv3qlyvgzkx9d54gzl03a70asdctnp2uz8wqzaymsrpq8ag",
    mode: "luncpump",
    pairCodeIds: [9912],
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

const parseBaseUnits = (value) => {
  if (!value || !/^\d+$/.test(String(value))) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

const addBaseUnits = (...values) =>
  values.reduce((sum, value) => sum + parseBaseUnits(value), 0n).toString();

const multiplyBaseUnits = (value, multiplier) =>
  (parseBaseUnits(value) * BigInt(multiplier)).toString();

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = [];
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
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

const loadPairsFromGarudaFactory = async (dex) => {
  const pairEntries = [];
  try {
    const data = await querySmart(dex.factory, { pairs: { limit: 2000 } });
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    for (const pair of pairs) {
      const entry = toPairEntry(pair);
      if (entry) pairEntries.push(entry);
    }
  } catch {
    // Garuda factory lists are not complete on-chain, so keep code-id fallback below.
  }

  const codeIds = Array.isArray(dex.pairCodeIds) ? dex.pairCodeIds : [];
  const byCode = await mapWithConcurrency(codeIds, 3, (codeId) => loadContractsByCodeId(codeId));
  byCode.forEach((contracts) => pairEntries.push(...(contracts ?? [])));

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

const loadPairsFromCodeIds = async (dex) => {
  const codeIds = Array.isArray(dex.pairCodeIds) ? dex.pairCodeIds : [];
  const byCode = await mapWithConcurrency(codeIds, 3, (codeId) => loadContractsByCodeId(codeId));
  const entries = [];
  byCode.forEach((contracts) => entries.push(...(contracts ?? [])));
  return mergePairEntries(entries);
};

const resolvePoolSnapshots = async (pairEntries, dex) => {
  const firstPass = await mapWithConcurrency(pairEntries, 14, async (pairEntry) => ({
    pairEntry,
    snapshot: await resolvePoolSnapshot(pairEntry, dex, {
      allowAssetInfoFallback: false,
    }),
  }));

  const snapshots = [];
  const unresolved = [];

  firstPass.forEach(({ pairEntry, snapshot }) => {
    if (snapshot) {
      snapshots.push(snapshot);
    } else {
      unresolved.push(pairEntry);
    }
  });

  if (!unresolved.length) return snapshots;

  // Public LCDs occasionally drop smart queries under burst load. Retry unresolved
  // pools slowly before deciding a discovered pair has no readable pool state.
  const retryPass = await mapWithConcurrency(unresolved, 3, async (pairEntry) => ({
    pairEntry,
    snapshot: await resolvePoolSnapshot(pairEntry, dex, {
      allowAssetInfoFallback: true,
    }),
  }));

  retryPass.forEach(({ snapshot }) => {
    if (snapshot) snapshots.push(snapshot);
  });

  const recovered = retryPass.filter(({ snapshot }) => Boolean(snapshot)).length;
  if (recovered) {
    console.log(`${dex.label}: recovered ${recovered} pool snapshots on retry`);
  }

  return snapshots;
};

const resolvePoolSnapshot = async (
  pairEntry,
  dex,
  { allowAssetInfoFallback = true } = {}
) => {
  const pairAddress = pairEntry?.pair;
  if (!pairAddress) return null;

  if (dex.mode === "terrapump") {
    return resolveTerraPumpSnapshot(pairAddress, dex);
  }

  if (dex.mode === "luncpump") {
    return resolveLuncPumpSnapshot(pairAddress, dex);
  }

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
    return allowAssetInfoFallback ? fromAssetInfos(pairEntry?.assetInfos) : null;
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

  return allowAssetInfoFallback ? fromAssetInfos(pairEntry?.assetInfos) : null;
};

const resolveTerraPumpSnapshot = async (pairAddress, dex) => {
  let info;
  let config;
  try {
    [info, config] = await Promise.all([
      querySmart(pairAddress, { info: {} }),
      querySmart(pairAddress, { config: {} }),
    ]);
  } catch {
    return null;
  }

  const tokenAddress =
    info?.token_address ?? config?.token ?? config?.token_address ?? "";
  const nativeDenom =
    info?.native_denom ?? config?.config?.native_denom ?? "uluna";
  if (!looksLikeTerraAddress(tokenAddress) || !nativeDenom) return null;

  const tokenAmount = String(info?.vault_token ?? "0");
  const actualNativeAmount = String(info?.vault_native ?? "0");
  const virtualNativeAmount = String(info?.virtual_reserve ?? config?.virtual_reserve ?? "0");
  const effectiveNativeAmount = addBaseUnits(actualNativeAmount, virtualNativeAmount);
  const tokenId = `cw20:${tokenAddress.toLowerCase()}`;
  const nativeId = `native:${nativeDenom}`;

  return {
    pair: pairAddress,
    dexId: dex.id,
    dexLabel: dex.label,
    type: "bonding-terrapump",
    assets: [tokenAddress.toLowerCase(), nativeDenom],
    poolAssets: [
      { id: tokenId, amount: tokenAmount },
      { id: nativeId, amount: effectiveNativeAmount },
    ],
    bonding: {
      protocol: "terrapump",
      factory: config?.contract_factory ?? "",
      tokenAddress: tokenAddress.toLowerCase(),
      nativeDenom,
      status: String(info?.status ?? config?.status ?? ""),
      virtualQuoteAmount: virtualNativeAmount,
      liquidityAssetId: nativeId,
      liquidityAmount: actualNativeAmount,
    },
  };
};

const resolveLuncPumpSnapshot = async (tokenAddress, dex) => {
  if (!dex.factory || !looksLikeTerraAddress(tokenAddress)) return null;

  let memeConfig;
  try {
    memeConfig = await querySmart(dex.factory, {
      get_meme_config: {
        token_address: tokenAddress,
      },
    });
  } catch {
    return null;
  }

  const nativeDenom = "uluna";
  const tokenId = `cw20:${tokenAddress.toLowerCase()}`;
  const nativeId = `native:${nativeDenom}`;
  const tokenReserve = String(memeConfig?.token_reserve ?? "0");
  const luncReserve = String(memeConfig?.lunc_reserve ?? "0");
  const actualLuncReserve = String(memeConfig?.actual_lunc_reserve ?? "0");

  return {
    pair: tokenAddress.toLowerCase(),
    dexId: dex.id,
    dexLabel: dex.label,
    type: "bonding-luncpump",
    assets: [tokenAddress.toLowerCase(), nativeDenom],
    poolAssets: [
      { id: tokenId, amount: tokenReserve },
      { id: nativeId, amount: luncReserve },
    ],
    bonding: {
      protocol: "luncpump",
      factory: dex.factory,
      tokenAddress: tokenAddress.toLowerCase(),
      nativeDenom,
      status: memeConfig?.is_matured ? "matured" : "open",
      virtualQuoteAmount: String(memeConfig?.initial_lunc_reserve ?? "0"),
      liquidityAssetId: nativeId,
      liquidityAmount: multiplyBaseUnits(actualLuncReserve, 2),
    },
  };
};

const parseOutArg = () => {
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0 && process.argv[outIndex + 1]) {
    return path.resolve(process.cwd(), process.argv[outIndex + 1]);
  }
  return DEFAULT_OUT;
};

const readExistingVolumeMap = async (outFile) => {
  try {
    const payload = JSON.parse(await fs.readFile(outFile, "utf8"));
    const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
    const volumesByPair = new Map();

    pairs.forEach((entry) => {
      const pair = typeof entry?.pair === "string" ? entry.pair.toLowerCase() : "";
      const volumes = entry?.volumes;
      if (!pair || !volumes || typeof volumes !== "object") return;
      volumesByPair.set(pair, volumes);
    });

    return volumesByPair;
  } catch {
    return new Map();
  }
};

const run = async () => {
  const outFile = parseOutArg();
  const existingVolumes = await readExistingVolumeMap(outFile);
  const records = [];

  for (const dex of DEXES) {
    const pairEntries =
      dex.mode === "garuda"
        ? await loadPairsFromGarudaFactory(dex)
        : dex.mode === "astroport"
        ? await loadPairsFromAstroportFactory(dex)
        : dex.mode === "code-id" ||
          dex.mode === "terrapump" ||
          dex.mode === "luncpump"
        ? await loadPairsFromCodeIds(dex)
        : await loadPairsFromTerraswapFactory(dex.factory);

    console.log(`${dex.label}: discovered ${pairEntries.length} pairs`);

    const snapshots = await resolvePoolSnapshots(pairEntries, dex);

    console.log(`${dex.label}: resolved ${snapshots.length} pool snapshots`);
    records.push(...snapshots);
  }

  const byPair = new Map();
  for (const entry of records) {
    if (!entry?.pair) continue;
    if (!byPair.has(entry.pair)) byPair.set(entry.pair, entry);
  }

  const pairs = Array.from(byPair.values())
    .sort((a, b) =>
      a.dexLabel === b.dexLabel
        ? a.pair.localeCompare(b.pair)
        : a.dexLabel.localeCompare(b.dexLabel)
    )
    .map((entry) => {
      const volumes = existingVolumes.get(entry.pair);
      return volumes ? { ...entry, volumes } : entry;
    });

  if (Number.isFinite(MIN_PAIR_COUNT) && pairs.length < MIN_PAIR_COUNT) {
    throw new Error(
      `Market index resolved ${pairs.length} pools, below MARKET_INDEX_MIN_PAIRS=${MIN_PAIR_COUNT}`
    );
  }

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
