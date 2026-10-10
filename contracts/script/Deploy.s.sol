// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Bootstrap} from "../src/Bootstrap.sol";

/// @notice Deploys + wires the whole system with ONE transaction (Bootstrap). Afterwards nobody holds any power.
///
///   local:   anvil --code-size-limit 131072 &
///            forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --account <keystore> --sender <addr>
///
///   Monad testnet (never paste a raw key; use an encrypted keystore or an Alchemy Agent Wallet session):
///            forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --account <keystore> --sender <addr> --broadcast --slow
///
/// `FULL_ENABLED=false` switches the hidden-loadout Full format off (default: on).
contract Deploy is Script {
    function run() external returns (Bootstrap b) {
        bool fullEnabled = vm.envOr("FULL_ENABLED", true);
        vm.startBroadcast();
        b = new Bootstrap(fullEnabled);
        vm.stopBroadcast();
        console2.log("Cards ", address(b.cards()));
        console2.log("Armory", address(b.armory()));
        console2.log("Arena ", address(b.arena()));
        console2.log("fullEnabled", fullEnabled);
    }
}
