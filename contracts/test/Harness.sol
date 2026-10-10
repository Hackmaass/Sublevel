// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Cards} from "../src/Cards.sol";
import {Armory} from "../src/Armory.sol";
import {Arena} from "../src/Arena.sol";
import {Ladder} from "../src/Ladder.sol";
import {Engine} from "../src/Engine.sol";
import {BoutCodec} from "../src/BoutCodec.sol";

/// @notice Shared client-side logic for Arena tests: salts, commits, reveals, hidden-card openings (Full), pool building.
///         It plays the role of the front end, so every call here is also a worked example of the real client flow.
abstract contract Harness is Test {
    Cards internal cards;
    Armory internal armory;
    Arena internal arena;
    Ladder internal ladder;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint8 internal constant TAG_LEAD = 0;
    uint8 internal constant TAG_ACTION = 1;
    uint8 internal constant TAG_REPLACE = 2;

    /// @dev boutId → side → slot → cardId : what each player secretly brought (slots 0–2 fighters, 3–4 tricks)
    mapping(uint256 => mapping(uint8 => uint256[5])) internal handOf;
    /// @dev every (arena, bout, side, tag, turn) may be committed AT MOST ONCE — salts are derived from this tuple, so a repeat would
    ///      let an opponent who saw the first revealed choice brute-force the next (≤ 8 choices).
    mapping(bytes32 => bool) internal usedCommit;
    uint256 internal opensSeen; // how many OpenCards pauses were played through

    function _deploy(bool fullEnabled) internal {
        cards = new Cards();
        armory = new Armory(cards);
        ladder = new Ladder();
        arena = new Arena(cards, armory, ladder, fullEnabled);
        cards.wire(address(armory), address(arena));
        armory.wire(address(arena));
        ladder.wire(address(arena));
    }

    /* ---------------- salts (deterministic, like the real client's per-phase derivation) ---------------- */
    function _salt(uint256 id, uint8 side, uint8 tag, uint8 turn) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", id, side, tag, turn));
    }

    function _leadSalt(uint256 id, uint8 side) internal pure returns (bytes32) {
        return keccak256(abi.encode("leadsalt", id, side));
    }

    function _slotSalt(uint256 id, uint8 side, uint8 slot) internal pure returns (bytes32) {
        return keccak256(abi.encode("slotsalt", id, side, slot));
    }

    function _who(uint256 id, uint8 side) internal view returns (address) {
        (address[2] memory p,,,,,,,,,) = arena.getBout(id);
        return p[side];
    }

    function _phase(uint256 id) internal view returns (Arena.Phase ph) {
        (,,, ph,,,,,,) = arena.getBout(id);
    }

    function _turnNow(uint256 id) internal view returns (uint8) {
        return uint8(arena.getState(id)[3]);
    }

    function _markCommit(uint256 id, uint8 side, uint8 tag, uint8 turn) internal {
        bytes32 k = keccak256(abi.encode(address(arena), id, side, tag, turn));
        require(!usedCommit[k], "commit domain repeated: same (bout, side, tag, turn) committed twice");
        usedCommit[k] = true;
    }

    /* ---------------- standard (Lite & Full actions) ---------------- */
    function _commitStd(uint256 id, uint8 side, uint8 tag, uint8 turn, uint8 choice) internal {
        _markCommit(id, side, tag, turn);
        address p = _who(id, side);
        bytes32 h = arena.commitHashOf(id, turn, tag, p, choice, _salt(id, side, tag, turn));
        vm.prank(p);
        arena.commit(id, side, h);
    }

    function _revealStd(uint256 id, uint8 side, uint8 tag, uint8 turn, uint8 choice) internal {
        vm.prank(_who(id, side));
        arena.reveal(id, side, choice, _salt(id, side, tag, turn));
    }

    /* ---------------- Full: hidden hand ---------------- */
    function _slotHashes(uint256 id, uint8 side) internal view returns (bytes32[5] memory h) {
        for (uint8 s = 0; s < 5; s++) h[s] = arena.slotHashOf(id, side, s, handOf[id][side][s], _slotSalt(id, side, s));
    }

    function _opening(uint256 id, uint8 side, uint8 slot) internal view returns (Arena.Opening memory) {
        return Arena.Opening(slot, handOf[id][side][slot], _slotSalt(id, side, slot));
    }

    function _commitLeadFull(uint256 id, uint8 side, uint8 lead) internal {
        _markCommit(id, side, TAG_LEAD, 0);
        address p = _who(id, side);
        bytes32 h = arena.fullLeadHashOf(id, p, lead, _slotHashes(id, side), _leadSalt(id, side));
        vm.prank(p);
        arena.commit(id, side, h);
    }

    function _revealLeadFull(uint256 id, uint8 side, uint8 lead) internal {
        address p = _who(id, side);
        bytes32[5] memory hs = _slotHashes(id, side); // (external calls in the argument list would consume the prank)
        vm.prank(p);
        arena.revealLead(id, side, lead, hs, _leadSalt(id, side), _opening(id, side, lead));
    }

    /// @dev does this choice bring a still-hidden card into play? (same rule the Arena applies)
    function _needsOpening(uint256 id, uint8 side, uint8 tag, uint8 choice) internal view returns (bool need, uint8 slot) {
        Engine.Bout memory bt = BoutCodec.unpack(arena.getState(id));
        if (tag == TAG_REPLACE) return (bt.s[side].f[choice].maxHp == 0, choice);
        if (Engine.isSwitch(choice)) {
            slot = choice - Engine.SWITCH0;
            return (bt.s[side].f[slot].maxHp == 0, slot);
        }
        if (Engine.isTrick(choice)) {
            uint8 j = choice - Engine.TRICK0;
            return (bt.s[side].t[j].id == Engine.UNOPENED_TRICK, 3 + j);
        }
        return (false, 0);
    }

    /// @dev reveal the way the real client does: with the opening only when the choice needs one (Full)
    function _revealAuto(uint256 id, uint8 side, uint8 tag, uint8 turn, uint8 choice, bool full) internal {
        if (full) {
            (bool need, uint8 slot) = _needsOpening(id, side, tag, choice);
            if (need) {
                vm.prank(_who(id, side));
                arena.revealOpen(id, side, choice, _salt(id, side, tag, turn), _opening(id, side, slot));
                return;
            }
        }
        _revealStd(id, side, tag, turn, choice);
    }

    /// @dev play the OpenCards pause: each side opens exactly what the Arena asks for
    function _doOpenPhase(uint256 id) internal {
        (,,, uint8[2] memory need) = arena.getHidden(id);
        opensSeen++;
        for (uint8 s = 0; s < 2; s++) {
            if (need[s] == 0) continue;
            uint256 n;
            for (uint8 b = 0; b < 5; b++) if ((need[s] >> b) & 1 == 1) n++;
            Arena.Opening[] memory ops = new Arena.Opening[](n);
            uint256 k;
            for (uint8 b = 0; b < 5; b++) if ((need[s] >> b) & 1 == 1) ops[k++] = _opening(id, s, b);
            vm.prank(_who(id, s));
            arena.openCards(id, s, ops);
        }
    }

    /// @dev after the bout: publish every still-hidden card so the stored state equals the full-information state
    function _openRest(uint256 id) internal {
        (,, uint8[2] memory openMask,) = arena.getHidden(id);
        for (uint8 s = 0; s < 2; s++) {
            uint256 n;
            for (uint8 b = 0; b < 5; b++) if ((openMask[s] >> b) & 1 == 0) n++;
            if (n == 0) continue;
            Arena.Opening[] memory ops = new Arena.Opening[](n);
            uint256 k;
            for (uint8 b = 0; b < 5; b++) if ((openMask[s] >> b) & 1 == 0) ops[k++] = _opening(id, s, b);
            vm.prank(_who(id, s));
            arena.openAfter(id, s, ops);
        }
    }

    /* ---------------- minting & pools ---------------- */
    /// @dev poolStr: comma list of F:style:atk0:atk1:spread | K:trickId  (registration order). Returns the pool and its card ids.
    function _mintPool(address who, string memory poolStr, uint8 format) internal returns (uint256 poolId, uint256[] memory ids) {
        string[] memory items = vm.split(poolStr, ",");
        ids = new uint256[](items.length);
        vm.startPrank(who);
        for (uint256 i = 0; i < items.length; i++) {
            vm.warp(block.timestamp + 6); // mint cooldown
            string[] memory p = vm.split(items[i], ":");
            string memory nm = string.concat("Card ", vm.toString(i));
            if (keccak256(bytes(p[0])) == keccak256("F")) {
                ids[i] = cards.mintFighter(uint8(vm.parseUint(p[1])), uint8(vm.parseUint(p[2])), uint8(vm.parseUint(p[3])), uint8(vm.parseUint(p[4])), bytes32(0), "", nm);
            } else {
                ids[i] = cards.mintTrick(uint8(vm.parseUint(p[1])), bytes32(0), "", nm);
            }
        }
        poolId = armory.register(format, ids);
        vm.stopPrank();
    }

    function _setHand(uint256 id, uint8 side, uint256[] memory poolIds, uint8[5] memory sel) internal {
        for (uint8 s = 0; s < 5; s++) handOf[id][side][s] = poolIds[sel[s]];
    }

    function _parseSel(string memory csv) internal pure returns (uint8[5] memory sel) {
        string[] memory p = vm.split(csv, ",");
        for (uint256 i = 0; i < 5; i++) sel[i] = uint8(vm.parseUint(p[i]));
    }
}
