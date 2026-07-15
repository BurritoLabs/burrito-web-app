import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringToPath } from "@cosmjs/crypto";
import { fromUtf8 } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet, Registry } from "@cosmjs/proto-signing";
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import {
  GasPrice,
  SigningStargateClient,
  assertIsDeliverTxSuccess,
  calculateFee,
  defaultRegistryTypes
} from "@cosmjs/stargate";
import {
  MsgExecuteContract,
  MsgMigrateContract,
  MsgStoreCode,
  MsgStoreCodeResponse
} from "cosmjs-types/cosmwasm/wasm/v1/tx.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const options = Object.fromEntries(
  rawArgs
    .filter((arg) => arg.includes("="))
    .map((arg) => {
      const [key, ...parts] = arg.replace(/^--/, "").split("=");
      return [key, parts.join("=")];
    })
);
const env = process.env;
const isDryRun = args.has("--dry-run") || env.DEPLOY_DRY_RUN === "1";
const isConfirmed =
  args.has("--confirm-upgrade") || env.CONFIRM_CONTRACT_UPGRADE === "1";

const chainKey = (options.chain || env.DEPLOY_CHAIN || "lunc").toLowerCase();
const chains = {
  lunc: {
    chainId: "columbus-5",
    rpc: "https://terra-classic-rpc.publicnode.com:443",
    rpcEnv: "CLASSIC_RPC",
    gasPrice: "28.325uluna",
    lpLockerAddress:
      "terra17cp6pgu9p2psz7l9kn56237d0l9sl5h8dhhdmdtkpqpp7sssfajsm7wuff",
    launchRegistryAddress:
      "terra1cjhzf5dxe84qkn4w8cfhxsm9zythhd3mxqgsggtsgqdj77z2rh7q72fdp0"
  },
  luna: {
    chainId: "phoenix-1",
    rpc: "https://terra-rpc.publicnode.com:443",
    rpcEnv: "LUNA_RPC",
    gasPrice: "0.015uluna",
    lpLockerAddress:
      "terra1zs54uanqzwh2y4a6z9xlzawjyjp3tddd99ad0h58ghr5yh2fdfjq95gmcv",
    launchRegistryAddress:
      "terra1wlfv0q9hye0x0tpd8844c0cmnaz7893x50h2z9q7897d6mjw0w3st4xj5f"
  }
};
const chain = chains[chainKey];
if (!chain) throw new Error('chain must be "lunc" or "luna".');

const optional = (name, fallback) => env[name]?.trim() || fallback;
const required = (name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const resolveFromRoot = (value) =>
  path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
const ensureFile = (filePath, label) => {
  if (!existsSync(filePath)) throw new Error(`${label} wasm not found: ${filePath}`);
};

const rpc = optional("DEPLOY_RPC", optional(chain.rpcEnv, chain.rpc));
const gasPrice = GasPrice.fromString(
  optional("DEPLOY_GAS_PRICE", chain.gasPrice)
);
const storeGas = Number(optional("STORE_GAS", "5000000"));
const migrateGas = Number(optional("MIGRATE_GAS", "800000"));
const executeGas = Number(optional("REINDEX_GAS", "600000"));
const reindexLimit = Number(optional("REINDEX_LIMIT", "500"));
const lpLockerWasm = resolveFromRoot(
  optional("LP_LOCKER_WASM", "artifacts/launchpad/burrito_lp_locker.wasm")
);
const launchRegistryWasm = resolveFromRoot(
  optional(
    "LAUNCH_REGISTRY_WASM",
    "artifacts/launchpad/burrito_launch_registry.wasm"
  )
);
const lpLockerAddress = optional("LP_LOCKER_ADDRESS", chain.lpLockerAddress);
const launchRegistryAddress = optional(
  "LAUNCH_REGISTRY_ADDRESS",
  chain.launchRegistryAddress
);
const outputPath = resolveFromRoot(
  optional(
    "DEPLOY_OUTPUT",
    `artifacts/launchpad/upgrade-result-${chainKey}.json`
  )
);

if (!Number.isInteger(reindexLimit) || reindexLimit < 1 || reindexLimit > 500) {
  throw new Error("REINDEX_LIMIT must be an integer between 1 and 500.");
}

const registry = new Registry(defaultRegistryTypes);
registry.register("/cosmwasm.wasm.v1.MsgStoreCode", MsgStoreCode);
registry.register("/cosmwasm.wasm.v1.MsgMigrateContract", MsgMigrateContract);
registry.register("/cosmwasm.wasm.v1.MsgExecuteContract", MsgExecuteContract);
const feeForGas = (gas) => calculateFee(Math.ceil(gas), gasPrice);
const eventValue = (result, keys) => {
  for (const event of result.events) {
    for (const attribute of event.attributes) {
      if (keys.includes(attribute.key)) return attribute.value;
    }
  }
  return undefined;
};

const getFirstAccount = async () => {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    required("DEPLOYER_MNEMONIC"),
    {
      prefix: "terra",
      hdPaths: [stringToPath("m/44'/330'/0'/0/0")]
    }
  );
  const [account] = await wallet.getAccounts();
  if (!account?.address) throw new Error("No deployer account derived.");
  return { wallet, address: account.address };
};

const storeCode = async (client, sender, wasmPath, label) => {
  const result = await client.signAndBroadcast(
    sender,
    [
      {
        typeUrl: "/cosmwasm.wasm.v1.MsgStoreCode",
        value: MsgStoreCode.fromPartial({
          sender,
          wasmByteCode: readFileSync(wasmPath)
        })
      }
    ],
    feeForGas(storeGas),
    `Burrito Launchpad upgrade store ${label}`
  );
  assertIsDeliverTxSuccess(result);
  const response = result.msgResponses.find(
    (item) => item.typeUrl === "/cosmwasm.wasm.v1.MsgStoreCodeResponse"
  );
  const codeId = response
    ? MsgStoreCodeResponse.decode(response.value).codeId.toString()
    : eventValue(result, ["code_id"]);
  if (!codeId) throw new Error(`Could not read ${label} code id from tx.`);
  return { codeId, txHash: result.transactionHash };
};

const migrateContract = async (client, sender, contract, codeId, msg, label) => {
  const result = await client.signAndBroadcast(
    sender,
    [
      {
        typeUrl: "/cosmwasm.wasm.v1.MsgMigrateContract",
        value: MsgMigrateContract.fromPartial({
          sender,
          contract,
          codeId: BigInt(codeId),
          msg: fromUtf8(JSON.stringify(msg))
        })
      }
    ],
    feeForGas(migrateGas),
    `Burrito Launchpad migrate ${label}`
  );
  assertIsDeliverTxSuccess(result);
  return result.transactionHash;
};

const reindexLocks = async (client, sender) => {
  const result = await client.signAndBroadcast(
    sender,
    [
      {
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: MsgExecuteContract.fromPartial({
          sender,
          contract: lpLockerAddress,
          msg: fromUtf8(
            JSON.stringify({ reindex_locks: { limit: reindexLimit } })
          ),
          funds: []
        })
      }
    ],
    feeForGas(executeGas),
    "Burrito Launchpad reindex LP locks"
  );
  assertIsDeliverTxSuccess(result);
  return result.transactionHash;
};

const main = async () => {
  ensureFile(lpLockerWasm, "LP locker");
  ensureFile(launchRegistryWasm, "Launch registry");

  const plan = {
    dryRun: isDryRun,
    chainKey,
    chainId: chain.chainId,
    rpc,
    lpLockerAddress,
    launchRegistryAddress,
    lpLockerWasm,
    launchRegistryWasm,
    reindexLimit,
    outputPath
  };
  if (isDryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (!isConfirmed) {
    throw new Error(
      "Refusing a contract upgrade without --confirm-upgrade or CONFIRM_CONTRACT_UPGRADE=1."
    );
  }

  const { wallet, address } = await getFirstAccount();
  const readClient = await CosmWasmClient.connect(rpc);
  const signingClient = await SigningStargateClient.connectWithSigner(rpc, wallet, {
    gasPrice,
    registry
  });
  try {
    const actualChainId = await signingClient.getChainId();
    if (actualChainId !== chain.chainId) {
      throw new Error(
        `Upgrade RPC chain mismatch. Expected ${chain.chainId}, received ${actualChainId}.`
      );
    }

    const [lockerInfoBefore, registryInfoBefore, lockerConfig, registryConfig] =
      await Promise.all([
        readClient.getContract(lpLockerAddress),
        readClient.getContract(launchRegistryAddress),
        readClient.queryContractSmart(lpLockerAddress, { config: {} }),
        readClient.queryContractSmart(launchRegistryAddress, { config: {} })
      ]);
    if (lockerInfoBefore.admin !== address || registryInfoBefore.admin !== address) {
      throw new Error("Deployer must be the current admin of both contracts.");
    }
    if (lockerConfig.owner !== address) {
      throw new Error("Deployer must be the LP locker owner to complete reindexing.");
    }
    if (registryConfig.locker_contract !== lpLockerAddress) {
      throw new Error("Registry points to a different LP locker; upgrade aborted.");
    }

    console.log("Storing LP locker code...");
    const lockerCode = await storeCode(
      signingClient,
      address,
      lpLockerWasm,
      "lp-locker"
    );
    console.log("Migrating LP locker...");
    const lockerMigrateTxHash = await migrateContract(
      signingClient,
      address,
      lpLockerAddress,
      lockerCode.codeId,
      { limit: reindexLimit },
      "lp-locker"
    );

    const reindexTxHashes = [];
    for (let round = 0; round < 1000; round += 1) {
      const status = await readClient.queryContractSmart(lpLockerAddress, {
        migration_status: {}
      });
      if (status.complete) break;
      console.log(`Reindexing LP locks after cursor ${status.cursor ?? "start"}...`);
      reindexTxHashes.push(await reindexLocks(signingClient, address));
      if (round === 999) throw new Error("LP lock reindex exceeded 1000 batches.");
    }

    console.log("Storing launch registry code...");
    const registryCode = await storeCode(
      signingClient,
      address,
      launchRegistryWasm,
      "launch-registry"
    );
    console.log("Migrating launch registry...");
    const registryMigrateTxHash = await migrateContract(
      signingClient,
      address,
      launchRegistryAddress,
      registryCode.codeId,
      {},
      "launch-registry"
    );

    const [lockerInfoAfter, registryInfoAfter, migrationStatus] = await Promise.all([
      readClient.getContract(lpLockerAddress),
      readClient.getContract(launchRegistryAddress),
      readClient.queryContractSmart(lpLockerAddress, { migration_status: {} })
    ]);
    if (
      String(lockerInfoAfter.codeId) !== lockerCode.codeId ||
      String(registryInfoAfter.codeId) !== registryCode.codeId ||
      migrationStatus.complete !== true
    ) {
      throw new Error("Post-upgrade contract verification failed.");
    }

    const output = {
      ...plan,
      dryRun: false,
      deployer: address,
      lpLocker: {
        previousCodeId: String(lockerInfoBefore.codeId),
        codeId: lockerCode.codeId,
        storeTxHash: lockerCode.txHash,
        migrateTxHash: lockerMigrateTxHash,
        reindexTxHashes,
        migrationStatus
      },
      launchRegistry: {
        previousCodeId: String(registryInfoBefore.codeId),
        codeId: registryCode.codeId,
        storeTxHash: registryCode.txHash,
        migrateTxHash: registryMigrateTxHash
      }
    };
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify(output, null, 2));
  } finally {
    signingClient.disconnect();
    readClient.disconnect();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
