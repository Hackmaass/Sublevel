/**
 * Verify all five deployed contracts on the Monad explorers with the official verification API (one call each):
 *
 *   pnpm --filter @sublevel/chain verify <bootstrapAddress> [--dry]
 *
 * It reads the four child addresses from the Bootstrap's public getters, rebuilds the exact standard-JSON input with forge
 * (same compiler + optimizer settings as the build) and POSTs each contract with its constructor arguments.
 * Needs `forge build` in contracts/ first. `--dry` builds every request and prints its size without sending anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, encodeAbiParameters, getAddress, http, parseAbiParameters, type Address } from "viem";
import { bootstrapAbi } from "../src/bootstrap.generated";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const contracts = resolve(root, "contracts");
const FORGE = existsSync(resolve(root, "tools/foundry/forge.exe")) ? resolve(root, "tools/foundry/forge.exe") : "forge";
const CHAIN_ID = 10143;
const RPC = process.env.MONAD_RPC ?? "https://testnet-rpc.monad.xyz";
const API = "https://agents.devnads.com/v1/verify";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const bootstrap = args.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) as Address | undefined;
if (!bootstrap) {
  console.error("usage: pnpm --filter @sublevel/chain verify <bootstrapAddress> [--dry]");
  process.exit(1);
}

const client = createPublicClient({ transport: http(RPC) });
const get = (fn: "cards" | "armory" | "arena" | "ladder") => client.readContract({ address: bootstrap, abi: bootstrapAbi, functionName: fn }) as Promise<Address>;

/** the Arena's `fullEnabled` is an immutable of the deployment: read it back rather than assuming */
const arenaAbi = [{ type: "function", name: "fullEnabled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const;

async function main() {
  const [cards, armory, arena, ladder] = await Promise.all([get("cards"), get("armory"), get("arena"), get("ladder")]);
  const full = (await client.readContract({ address: arena, abi: arenaAbi, functionName: "fullEnabled" })) as boolean;
  console.log({ bootstrap, cards, armory, arena, ladder, full });

  const enc = (types: string, values: unknown[]) => encodeAbiParameters(parseAbiParameters(types), values as never).slice(2);
  const jobs: { name: string; address: Address; ctorArgs?: string }[] = [
    { name: "Cards", address: cards },
    { name: "Ladder", address: ladder },
    { name: "Armory", address: armory, ctorArgs: enc("address", [cards]) },
    { name: "Arena", address: arena, ctorArgs: enc("address, address, address, bool", [cards, armory, ladder, full]) },
    { name: "Bootstrap", address: bootstrap!, ctorArgs: enc("bool", [full]) },
  ];

  for (const j of jobs) {
    const out = resolve(contracts, `out/${j.name}.sol/${j.name}.json`);
    const metadata = (JSON.parse(readFileSync(out, "utf8")) as { metadata: { compiler: { version: string } } }).metadata;
    const standardJsonInput = JSON.parse(
      execFileSync(FORGE, ["verify-contract", j.address, `src/${j.name}.sol:${j.name}`, "--chain", String(CHAIN_ID), "--show-standard-json-input"], { cwd: contracts, maxBuffer: 64 * 1024 * 1024 }).toString(),
    );
    const body = {
      chainId: CHAIN_ID,
      contractAddress: getAddress(j.address),
      contractName: `src/${j.name}.sol:${j.name}`,
      compilerVersion: `v${metadata.compiler.version}`,
      standardJsonInput,
      foundryMetadata: metadata,
      ...(j.ctorArgs ? { constructorArgs: j.ctorArgs } : {}),
    };
    const json = JSON.stringify(body);
    if (dry) {
      console.log(`[dry] ${j.name.padEnd(9)} ${j.address} compiler v${metadata.compiler.version} request ${Math.round(json.length / 1024)} KB ctorArgs ${j.ctorArgs ? j.ctorArgs.length / 2 + " bytes" : "none"}`);
      continue;
    }
    const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: json });
    console.log(`${j.name.padEnd(9)} ${res.status}`, (await res.text()).slice(0, 300));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
