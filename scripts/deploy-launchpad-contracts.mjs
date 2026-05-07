import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringToPath } from "@cosmjs/crypto";
import { fromUtf8 } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet, Registry } from "@cosmjs/proto-signing";
import {
  GasPrice,
  SigningStargateClient,
  assertIsDeliverTxSuccess,
  calculateFee,
  defaultRegistryTypes
} from "@cosmjs/stargate";
import {
  MsgInstantiateContract,
  MsgInstantiateContractResponse,
  MsgStoreCode,
  MsgStoreCodeResponse
} from "cosmjs-types/cosmwasm/wasm/v1/tx.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_RPC = "https://terra-classic-rpc.publicnode.com:443";
const DEFAULT_GAS_PRICE = "28.325uluna";
const DEFAULT_STORE_GAS = 5_000_000;
const DEFAULT_INSTANTIATE_GAS = 600_000;

const env = process.env;

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run") || env.DEPLOY_DRY_RUN === "1";

const required = (name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const optional = (name, fallback) => {
  const value = env[name]?.trim();
  return value || fallback;
};

const resolveFromRoot = (value) =>
  path.isAbsolute(value) ? value : path.resolve(repoRoot, value);

const lpLockerWasm = resolveFromRoot(
  optional(
    "LP_LOCKER_WASM",
    "artifacts/launchpad/burrito_lp_locker.wasm"
  )
);
const launchRegistryWasm = resolveFromRoot(
  optional(
    "LAUNCH_REGISTRY_WASM",
    "artifacts/launchpad/burrito_launch_registry.wasm"
  )
);
const outputPath = resolveFromRoot(
  optional("DEPLOY_OUTPUT", "artifacts/launchpad/deploy-result.json")
);
const rpc = optional("CLASSIC_RPC", DEFAULT_RPC);
const gasPrice = GasPrice.fromString(optional("DEPLOY_GAS_PRICE", DEFAULT_GAS_PRICE));
const storeGas = Number(optional("STORE_GAS", String(DEFAULT_STORE_GAS)));
const instantiateGas = Number(
  optional("INSTANTIATE_GAS", String(DEFAULT_INSTANTIATE_GAS))
);

const registry = new Registry(defaultRegistryTypes);
registry.register("/cosmwasm.wasm.v1.MsgStoreCode", MsgStoreCode);
registry.register(
  "/cosmwasm.wasm.v1.MsgInstantiateContract",
  MsgInstantiateContract
);

const feeForGas = (gas) => calculateFee(Math.ceil(gas), gasPrice);

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

const ensureFile = (filePath, label) => {
  if (!existsSync(filePath)) {
    throw new Error(
      `${label} wasm not found: ${filePath}\n` +
        "Download the GitHub Actions artifact, unzip it, or set the env path explicitly."
    );
  }
};

const findMsgResponse = (result, typeUrl) =>
  result.msgResponses.find((response) => response.typeUrl === typeUrl);

const eventValue = (result, keys) => {
  for (const event of result.events) {
    for (const attribute of event.attributes) {
      if (keys.includes(attribute.key)) return attribute.value;
    }
  }
  return undefined;
};

const storeCode = async (client, sender, wasmPath, label) => {
  const wasmByteCode = readFileSync(wasmPath);
  const result = await client.signAndBroadcast(
    sender,
    [
      {
        typeUrl: "/cosmwasm.wasm.v1.MsgStoreCode",
        value: MsgStoreCode.fromPartial({
          sender,
          wasmByteCode
        })
      }
    ],
    feeForGas(storeGas),
    `Burrito Launchpad store ${label}`
  );
  assertIsDeliverTxSuccess(result);

  const response = findMsgResponse(
    result,
    "/cosmwasm.wasm.v1.MsgStoreCodeResponse"
  );
  const codeId = response
    ? MsgStoreCodeResponse.decode(response.value).codeId.toString()
    : eventValue(result, ["code_id"]);
  if (!codeId) throw new Error(`Could not read ${label} code id from tx.`);

  return {
    codeId,
    txHash: result.transactionHash,
    gasUsed: result.gasUsed.toString(),
    gasWanted: result.gasWanted.toString()
  };
};

const instantiate = async (client, sender, codeId, label, msg, owner) => {
  const result = await client.signAndBroadcast(
    sender,
    [
      {
        typeUrl: "/cosmwasm.wasm.v1.MsgInstantiateContract",
        value: MsgInstantiateContract.fromPartial({
          sender,
          admin: owner,
          codeId: BigInt(codeId),
          label,
          msg: fromUtf8(JSON.stringify(msg)),
          funds: []
        })
      }
    ],
    feeForGas(instantiateGas),
    `Burrito Launchpad instantiate ${label}`
  );
  assertIsDeliverTxSuccess(result);

  const response = findMsgResponse(
    result,
    "/cosmwasm.wasm.v1.MsgInstantiateContractResponse"
  );
  const contractAddress = response
    ? MsgInstantiateContractResponse.decode(response.value).address
    : eventValue(result, ["_contract_address", "contract_address"]);
  if (!contractAddress) {
    throw new Error(`Could not read ${label} contract address from tx.`);
  }

  return {
    contractAddress,
    txHash: result.transactionHash,
    gasUsed: result.gasUsed.toString(),
    gasWanted: result.gasWanted.toString()
  };
};

const main = async () => {
  ensureFile(lpLockerWasm, "LP locker");
  ensureFile(launchRegistryWasm, "Launch registry");

  const ownerOverride = env.DEPLOY_OWNER_ADDRESS?.trim();
  const adminOverride = env.DEPLOY_ADMIN_ADDRESS?.trim();

  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          rpc,
          lpLockerWasm,
          launchRegistryWasm,
          outputPath,
          gasPrice: gasPrice.toString(),
          storeGas,
          instantiateGas,
          owner: ownerOverride || "deployer address",
          admin: adminOverride || ownerOverride || "deployer address"
        },
        null,
        2
      )
    );
    return;
  }

  const { wallet, address } = await getFirstAccount();
  const owner = ownerOverride || address;
  const admin = adminOverride || owner;

  const client = await SigningStargateClient.connectWithSigner(rpc, wallet, {
    gasPrice,
    registry
  });

  console.log(`Deployer: ${address}`);
  console.log(`Owner:    ${owner}`);
  console.log(`Admin:    ${admin}`);
  console.log("Storing lp-locker...");
  const lpLockerCode = await storeCode(client, address, lpLockerWasm, "lp-locker");

  console.log("Instantiating lp-locker...");
  const lpLocker = await instantiate(
    client,
    address,
    lpLockerCode.codeId,
    "burrito-launchpad-lp-locker",
    { owner },
    admin
  );

  console.log("Storing launch-registry...");
  const launchRegistryCode = await storeCode(
    client,
    address,
    launchRegistryWasm,
    "launch-registry"
  );

  console.log("Instantiating launch-registry...");
  const launchRegistry = await instantiate(
    client,
    address,
    launchRegistryCode.codeId,
    "burrito-launchpad-registry",
    {
      owner,
      locker_contract: lpLocker.contractAddress
    },
    admin
  );

  const output = {
    chainId: "columbus-5",
    rpc,
    deployer: address,
    owner,
    admin,
    lpLocker: {
      codeId: lpLockerCode.codeId,
      contractAddress: lpLocker.contractAddress,
      storeTxHash: lpLockerCode.txHash,
      instantiateTxHash: lpLocker.txHash
    },
    launchRegistry: {
      codeId: launchRegistryCode.codeId,
      contractAddress: launchRegistry.contractAddress,
      storeTxHash: launchRegistryCode.txHash,
      instantiateTxHash: launchRegistry.txHash
    },
    cloudflare: {
      VITE_LAUNCHPAD_LP_LOCKER_ADDRESS: lpLocker.contractAddress,
      VITE_LAUNCHPAD_REGISTRY_ADDRESS: launchRegistry.contractAddress
    }
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(JSON.stringify(output, null, 2));
  console.log(`Saved deploy result: ${outputPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
