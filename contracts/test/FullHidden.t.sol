// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Cards} from "../src/Cards.sol";
import {Arena} from "../src/Arena.sol";
import {Engine} from "../src/Engine.sol";
import {BoutCodec} from "../src/BoutCodec.sol";
import {Harness} from "./Harness.sol";

/// @notice Full format: hidden hands (blinded slot hashes), openings, the OpenCards pause, and every way to cheat.
contract FullHiddenTest is Harness {
    // 5 fighters (pool idx 0–4) + 3 tricks (idx 5–7); every build is legal
    string constant POOL_A = "F:1:11:10:0,F:2:12:16:2,F:1:7:9:2,F:2:13:16:0,F:1:8:9:2,K:3,K:5,K:1";
    string constant POOL_B = "F:0:0:2:2,F:0:1:5:2,F:1:11:9:0,F:1:8:9:2,F:2:12:16:2,K:4,K:1,K:2";

    uint256[] idsA;
    uint256[] idsB;
    uint256 poolA;
    uint256 poolB;

    function setUp() public {
        vm.warp(1_000_000);
        _deploy(true);
        (poolA, idsA) = _mintPool(ALICE, POOL_A, 1);
        (poolB, idsB) = _mintPool(BOB, POOL_B, 1);
    }

    /* ---------------- helpers ---------------- */
    function _challenge() internal returns (uint256 id) {
        vm.prank(ALICE);
        id = arena.createChallenge(1, poolA);
        vm.prank(BOB);
        arena.acceptChallenge(id, poolB);
        _setHand(id, 0, idsA, [0, 1, 2, 5, 6]);
        _setHand(id, 1, idsB, [0, 1, 2, 5, 6]);
    }

    /// @dev challenge + both leads (slot 0) committed and revealed -> TurnCommit
    function _started() internal returns (uint256 id) {
        id = _challenge();
        _leads(id);
    }

    function _leads(uint256 id) internal {
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        _revealLeadFull(id, 0, 0);
        _revealLeadFull(id, 1, 0);
    }

    function _round(uint256 id, uint8 a, uint8 b) internal {
        uint8 t = _turnNow(id);
        _commitStd(id, 0, TAG_ACTION, t, a);
        _commitStd(id, 1, TAG_ACTION, t, b);
        _revealAuto(id, 0, TAG_ACTION, t, a, true);
        _revealAuto(id, 1, TAG_ACTION, t, b, true);
    }

    function _result(uint256 id) internal view returns (int8 w, uint8 reason) {
        (,,,,,,,, w, reason) = arena.getBout(id);
    }

    function _assertForfeitBy(uint256 id, uint8 loser) internal view {
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over), "bout over");
        (int8 w, uint8 reason) = _result(id);
        assertEq(w, loser == 0 ? int8(1) : int8(0), "other side wins");
        assertEq(reason, Engine.REASON_FORFEIT);
    }

    /* ---------------- privacy: nothing about the bench is on-chain until it is opened ---------------- */
    function test_hidden_cards_are_placeholders_until_opened() public {
        uint256 id = _started();
        Engine.Bout memory bt = BoutCodec.unpack(arena.getState(id));
        for (uint8 s = 0; s < 2; s++) {
            assertGt(bt.s[s].f[0].maxHp, 0, "lead is open");
            for (uint8 i = 1; i < 3; i++) {
                assertEq(bt.s[s].f[i].maxHp, 0, "bench stats hidden");
                assertEq(bt.s[s].f[i].style, 0);
                assertEq(bt.s[s].f[i].atk0, 0);
                assertTrue(bt.s[s].f[i].alive, "but it is known to be alive");
            }
            assertEq(bt.s[s].t[0].id, Engine.UNOPENED_TRICK, "tricks hidden");
            assertEq(bt.s[s].t[1].id, Engine.UNOPENED_TRICK);
        }
        (bytes32[5][2] memory hs, uint256[5][2] memory cardIds, uint8[2] memory openMask,) = arena.getHidden(id);
        assertEq(openMask[0], 1, "only the lead slot is open");
        for (uint8 s = 1; s < 5; s++) assertEq(cardIds[0][s], 0, "no card id stored for unopened slots");
        assertTrue(hs[0][2] != bytes32(0), "but the blinded hashes are locked");
    }

    function test_slot_hashes_are_blinded_per_slot() public {
        uint256 id = _challenge();
        // the pool is public (8 cards). Without the per-slot salt an observer cannot match a hash to a card.
        bytes32 h = arena.slotHashOf(id, 0, 1, handOf[id][0][1], _slotSalt(id, 0, 1));
        for (uint256 i = 0; i < idsA.length; i++) {
            assertTrue(arena.slotHashOf(id, 0, 1, idsA[i], bytes32(0)) != h, "unsalted guess must not match");
        }
        // different slots holding the SAME card hash differently (and different bouts/sides too)
        assertTrue(arena.slotHashOf(id, 0, 1, idsA[0], _slotSalt(id, 0, 1)) != arena.slotHashOf(id, 0, 2, idsA[0], _slotSalt(id, 0, 2)));
    }

    /* ---------------- the honest path ---------------- */
    function test_switch_trick_and_replacement_open_exactly_what_they_need() public {
        uint256 id = _started();
        // turn 0: Alice plays trick slot 3 (action 6), Bob switches to slot 1 (action 4)
        _round(id, 6, 4);
        (,, uint8[2] memory om,) = arena.getHidden(id);
        assertEq(om[0], uint8(0x01 | 0x08), "Alice opened lead + trick 0");
        assertEq(om[1], uint8(0x01 | 0x02), "Bob opened lead + fighter 1");
        // a second use of the same (already opened) kind needs no opening: plain reveal works
        Engine.Bout memory bt = BoutCodec.unpack(arena.getState(id));
        assertTrue(bt.s[0].t[0].used);
        assertEq(bt.s[1].active, 1);
        assertTrue(bt.s[1].f[1].revealed);
    }

    /* ---------------- wrong entry point ---------------- */
    function test_missing_or_superfluous_opening_reverts_without_forfeit() public {
        uint256 id = _started();
        uint8 t = _turnNow(id);
        _commitStd(id, 0, TAG_ACTION, t, 6); // trick slot 3 (hidden) -> needs an opening
        _commitStd(id, 1, TAG_ACTION, t, 2); // brace -> needs none
        vm.prank(ALICE);
        vm.expectRevert(Arena.OpeningRequired.selector);
        arena.reveal(id, 0, 6, _salt(id, 0, TAG_ACTION, t));
        vm.prank(BOB);
        vm.expectRevert(Arena.OpeningNotNeeded.selector);
        arena.revealOpen(id, 1, 2, _salt(id, 1, TAG_ACTION, t), _opening(id, 1, 1));
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.TurnReveal), "nothing lost: both can retry correctly");
        _revealAuto(id, 0, TAG_ACTION, t, 6, true);
        _revealAuto(id, 1, TAG_ACTION, t, 2, true);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.TurnCommit));
    }

    function test_full_lead_cannot_use_plain_reveal() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        vm.prank(ALICE);
        vm.expectRevert(Arena.BadPhase.selector);
        arena.reveal(id, 0, 0, _leadSalt(id, 0));
    }

    /* ---------------- cheating at the lead ---------------- */
    function test_lead_wrong_salt_forfeits() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        address p = ALICE;
        bytes32[5] memory hs = _slotHashes(id, 0);
        Arena.Opening memory o = _opening(id, 0, 0);
        vm.prank(p);
        arena.revealLead(id, 0, 0, hs, keccak256("wrong"), o);
        _assertForfeitBy(id, 0);
    }

    function test_lead_slot_hashes_that_differ_from_the_commit_forfeit() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        bytes32[5] memory hs = _slotHashes(id, 0);
        hs[3] = keccak256("swapped after commit");
        Arena.Opening memory o = _opening(id, 0, 0);
        bytes32 salt = _leadSalt(id, 0);
        vm.prank(ALICE);
        arena.revealLead(id, 0, 0, hs, salt, o);
        _assertForfeitBy(id, 0);
    }

    function test_lead_opening_with_wrong_card_forfeits() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        bytes32[5] memory hs = _slotHashes(id, 0);
        Arena.Opening memory o = Arena.Opening(0, idsA[3], _slotSalt(id, 0, 0)); // a different card than the one locked
        bytes32 salt = _leadSalt(id, 0);
        vm.prank(ALICE);
        arena.revealLead(id, 0, 0, hs, salt, o);
        _assertForfeitBy(id, 0);
    }

    function test_lead_opening_the_wrong_slot_forfeits() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        bytes32[5] memory hs = _slotHashes(id, 0);
        Arena.Opening memory o = _opening(id, 0, 1); // lead is slot 0, opens slot 1
        bytes32 salt = _leadSalt(id, 0);
        vm.prank(ALICE);
        arena.revealLead(id, 0, 0, hs, salt, o);
        _assertForfeitBy(id, 0);
    }

    function test_lead_slot_must_be_a_fighter_and_in_range() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 3); // "lead" = a trick slot
        _commitLeadFull(id, 1, 0);
        bytes32[5] memory hs = _slotHashes(id, 0);
        Arena.Opening memory o = _opening(id, 0, 3);
        bytes32 salt = _leadSalt(id, 0);
        vm.prank(ALICE);
        arena.revealLead(id, 0, 3, hs, salt, o);
        _assertForfeitBy(id, 0);
    }

    function test_lead_card_from_someone_elses_pool_forfeits() public {
        uint256 id = _challenge();
        handOf[id][0][0] = idsB[0]; // Alice commits to Bob's card (hash matches, but it is not in HER locked pool)
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        _revealLeadFull(id, 1, 0);
        _revealLeadFull(id, 0, 0);
        _assertForfeitBy(id, 0);
    }

    function test_lead_trick_card_in_a_fighter_slot_forfeits() public {
        uint256 id = _challenge();
        handOf[id][0][0] = idsA[5]; // a trick in the lead (fighter) slot
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        _revealLeadFull(id, 0, 0);
        _assertForfeitBy(id, 0);
    }

    /* ---------------- cheating when a card enters play ---------------- */
    function _switchCheat(uint256 id, uint8 slotToOpenForSwitch1) internal {
        // Alice switches to slot 1 (action 4) - her ACTUAL opening is whatever the test hands in
        uint8 t = _turnNow(id);
        _commitStd(id, 0, TAG_ACTION, t, 4);
        _commitStd(id, 1, TAG_ACTION, t, 2);
        Arena.Opening memory o = _opening(id, 0, slotToOpenForSwitch1);
        bytes32 salt = _salt(id, 0, TAG_ACTION, t);
        vm.prank(ALICE);
        arena.revealOpen(id, 0, 4, salt, o);
    }

    function test_switch_opening_the_wrong_slot_forfeits() public {
        uint256 id = _started();
        _switchCheat(id, 2);
        _assertForfeitBy(id, 0);
    }

    function test_switch_duplicate_card_across_two_slots_forfeits() public {
        uint256 id = _challenge();
        handOf[id][0][1] = idsA[0]; // same card in slots 0 and 1
        _leads(id);
        _switchCheat(id, 1);
        _assertForfeitBy(id, 0);
    }

    function test_switch_trick_card_in_a_fighter_slot_forfeits() public {
        uint256 id = _challenge();
        handOf[id][0][1] = idsA[5]; // a trick card in fighter slot 1
        _leads(id);
        _switchCheat(id, 1);
        _assertForfeitBy(id, 0);
    }

    function test_switch_card_not_in_pool_forfeits() public {
        uint256 id = _challenge();
        handOf[id][0][1] = idsB[1]; // Bob's card
        _leads(id);
        _switchCheat(id, 1);
        _assertForfeitBy(id, 0);
    }

    function test_switch_wrong_slot_salt_forfeits() public {
        uint256 id = _started();
        uint8 t = _turnNow(id);
        _commitStd(id, 0, TAG_ACTION, t, 4);
        _commitStd(id, 1, TAG_ACTION, t, 2);
        Arena.Opening memory o = Arena.Opening(1, idsA[1], keccak256("nope"));
        bytes32 salt = _salt(id, 0, TAG_ACTION, t);
        vm.prank(ALICE);
        arena.revealOpen(id, 0, 4, salt, o);
        _assertForfeitBy(id, 0);
    }

    function test_trick_in_a_trick_slot_but_fighter_card_forfeits() public {
        uint256 id = _challenge();
        handOf[id][0][3] = idsA[1]; // a fighter in trick slot 3
        _leads(id);
        uint8 t = _turnNow(id);
        _commitStd(id, 0, TAG_ACTION, t, 6);
        _commitStd(id, 1, TAG_ACTION, t, 2);
        Arena.Opening memory o = _opening(id, 0, 3);
        bytes32 salt = _salt(id, 0, TAG_ACTION, t);
        vm.prank(ALICE);
        arena.revealOpen(id, 0, 6, salt, o);
        _assertForfeitBy(id, 0);
    }

    /* ---------------- the OpenCards pause (turn-cap decision) ---------------- */
    function _braceToTheCap(uint256 id) internal {
        for (uint256 i = 0; i < 10; i++) _round(id, 2, 2); // 10 turns: nobody scores -> tied KOs at the cap -> decision reads every max HP
    }

    function test_decision_pauses_and_both_sides_must_open_their_bench() public {
        uint256 id = _started();
        _braceToTheCap(id);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.OpenCards), "paused: the decision needs the unplayed fighters");
        (,,, uint8[2] memory need) = arena.getHidden(id);
        assertEq(need[0], 0x06);
        assertEq(need[1], 0x06);
        _doOpenPhase(id);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over));
        (int8 w, uint8 reason) = _result(id);
        assertEq(reason, Engine.REASON_DRAW, "nobody dealt damage -> equal HP, equal damage -> draw");
        assertEq(w, 2);
        // the full state is now public for the slots that were opened; the tricks stay hidden unless the owner publishes them
        _openRest(id);
        Engine.Bout memory bt = BoutCodec.unpack(arena.getState(id));
        assertGt(bt.s[0].f[2].maxHp, 0);
        assertEq(bt.s[0].t[1].id, 5, "slot 4 held pool card 6 = trick 5");
    }

    function test_skipping_the_end_reveal_forfeits_after_the_timeout() public {
        uint256 id = _started();
        _braceToTheCap(id);
        _doOneSide(id, 0);
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id);
        _assertForfeitBy(id, 1);
    }

    function test_both_skipping_the_end_reveal_voids() public {
        uint256 id = _started();
        _braceToTheCap(id);
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Void));
    }

    function _doOneSide(uint256 id, uint8 s) internal {
        Arena.Opening[] memory ops = new Arena.Opening[](2);
        ops[0] = _opening(id, s, 1);
        ops[1] = _opening(id, s, 2);
        vm.prank(_who(id, s));
        arena.openCards(id, s, ops);
    }

    function test_partial_end_reveal_reverts_and_can_be_completed() public {
        uint256 id = _started();
        _braceToTheCap(id);
        Arena.Opening[] memory one = new Arena.Opening[](1);
        one[0] = _opening(id, 0, 1);
        address p = ALICE;
        vm.prank(p);
        vm.expectRevert(Arena.OpeningIncomplete.selector);
        arena.openCards(id, 0, one);
        _doOneSide(id, 0); // complete
        _doOneSide(id, 1);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over));
    }

    function test_end_reveal_of_a_slot_nobody_asked_for_forfeits() public {
        uint256 id = _started();
        _braceToTheCap(id);
        Arena.Opening[] memory ops = new Arena.Opening[](3);
        ops[0] = _opening(id, 0, 1);
        ops[1] = _opening(id, 0, 2);
        ops[2] = _opening(id, 0, 3); // a trick: not needed for the decision
        vm.prank(ALICE);
        arena.openCards(id, 0, ops);
        _assertForfeitBy(id, 0);
    }

    function test_end_reveal_with_a_bad_card_forfeits() public {
        uint256 id = _started();
        _braceToTheCap(id);
        Arena.Opening[] memory ops = new Arena.Opening[](2);
        ops[0] = _opening(id, 1, 1);
        ops[1] = Arena.Opening(2, idsB[4], keccak256("bad"));
        vm.prank(BOB);
        arena.openCards(id, 1, ops);
        _assertForfeitBy(id, 1);
    }

    /* ---------------- records: only what entered play ---------------- */
    function test_records_only_for_cards_that_were_played() public {
        uint256 id = _started();
        _round(id, 6, 2); // Alice uses trick 0; both leads were active
        // Alice forfeits by timing out later: simply let Bob time out instead
        _commitStd(id, 0, TAG_ACTION, _turnNow(id), 2);
        _commitStd(id, 1, TAG_ACTION, _turnNow(id), 2);
        _revealAuto(id, 0, TAG_ACTION, _turnNow(id), 2, true);
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id); // Bob did not reveal -> Alice wins
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over));
        assertEq(cards.recordOf(handOf[id][0][0]).bouts, 1, "Alice's lead has a career entry");
        assertEq(cards.recordOf(handOf[id][0][0]).wins, 1);
        assertEq(cards.recordOf(handOf[id][0][3]).bouts, 1, "the trick she used has one");
        assertEq(cards.recordOf(handOf[id][0][4]).bouts, 0, "the trick she never used has none");
        assertEq(cards.recordOf(handOf[id][0][1]).bouts, 0, "bench fighter that never played has none");
        assertEq(cards.recordOf(idsA[4]).bouts, 0, "a pool card that was never in the hand has none");
        assertEq(cards.recordOf(handOf[id][1][0]).losses, 1);
    }

    /* ---------------- gas profile (EVM-priced; Monad cold storage is ~4x dearer: re-measure on testnet) ---------------- */
    function _gasRevealLead(uint256 id, uint8 side, string memory label) internal {
        address p = _who(id, side);
        bytes32[5] memory hs = _slotHashes(id, side);
        Arena.Opening memory o = _opening(id, side, 0);
        bytes32 salt = _leadSalt(id, side);
        vm.prank(p);
        uint256 g = gasleft();
        arena.revealLead(id, side, 0, hs, salt, o);
        emit log_named_uint(label, g - gasleft());
    }

    function test_gas_profile_full_start_and_switch() public {
        uint256 id = _challenge();
        _commitLeadFull(id, 0, 0);
        _commitLeadFull(id, 1, 0);
        _gasRevealLead(id, 0, "revealLead (1st)");
        _gasRevealLead(id, 1, "revealLead (2nd, START)");

        uint8 t = _turnNow(id);
        _commitStd(id, 0, TAG_ACTION, t, 4);
        _commitStd(id, 1, TAG_ACTION, t, 2);
        Arena.Opening memory o1 = _opening(id, 0, 1);
        bytes32 s0 = _salt(id, 0, TAG_ACTION, t);
        vm.prank(ALICE);
        uint256 g = gasleft();
        arena.revealOpen(id, 0, 4, s0, o1);
        emit log_named_uint("reveal+open switch (1st)", g - gasleft());
        bytes32 s1 = _salt(id, 1, TAG_ACTION, t);
        vm.prank(BOB);
        g = gasleft();
        arena.reveal(id, 1, 2, s1);
        emit log_named_uint("reveal (2nd, RESOLVE)", g - gasleft());
    }

    function test_gas_profile_full_pause() public {
        uint256 id = _started();
        _braceToTheCap(id);
        for (uint8 s = 0; s < 2; s++) {
            Arena.Opening[] memory ops = new Arena.Opening[](2);
            ops[0] = _opening(id, s, 1);
            ops[1] = _opening(id, s, 2);
            address p = _who(id, s);
            vm.prank(p);
            uint256 g = gasleft();
            arena.openCards(id, s, ops);
            emit log_named_uint(s == 0 ? "openCards (1st, 2 slots)" : "openCards (2nd, FINISH)", g - gasleft());
        }
    }

    /* ---------------- fuzz: the Arena equals the engine, whatever the hands ---------------- */
    function _pick(uint256 seed, uint256 salt, uint256 n) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, salt))) % n;
    }

    /// @dev choose 3 of the 5 fighters and 2 of the 3 tricks, in a random order
    function _randomSel(uint256 seed, uint256 who) internal pure returns (uint8[5] memory sel) {
        uint8[5] memory f = [0, 1, 2, 3, 4];
        for (uint256 i = 4; i > 0; i--) {
            uint256 j = _pick(seed, who * 100 + i, i + 1);
            (f[i], f[j]) = (f[j], f[i]);
        }
        uint8[3] memory k = [5, 6, 7];
        for (uint256 i = 2; i > 0; i--) {
            uint256 j = _pick(seed, who * 100 + 50 + i, i + 1);
            (k[i], k[j]) = (k[j], k[i]);
        }
        sel = [f[0], f[1], f[2], k[0], k[1]];
    }

    function _mirrorLoadout(uint256 id, uint8 side, uint8 lead) internal view returns (Engine.Loadout memory l) {
        l.nF = 3;
        l.nT = 2;
        l.lead = lead;
        for (uint8 i = 0; i < 3; i++) {
            Cards.Card memory c = cards.cardData(handOf[id][side][i]);
            l.style[i] = c.style;
            l.atk0[i] = c.atk0;
            l.atk1[i] = c.atk1;
            l.spread[i] = c.spread;
        }
        for (uint8 j = 0; j < 2; j++) l.tricks[j] = cards.cardData(handOf[id][side][3 + j]).trickId;
    }

    function testFuzz_hidden_bouts_equal_the_engine(uint256 seed) public {
        vm.prank(ALICE);
        uint256 id = arena.createChallenge(1, poolA);
        vm.prank(BOB);
        arena.acceptChallenge(id, poolB);
        _setHand(id, 0, idsA, _randomSel(seed, 0));
        _setHand(id, 1, idsB, _randomSel(seed, 1));
        uint8 leadA = uint8(_pick(seed, 1000, 3));
        uint8 leadB = uint8(_pick(seed, 1001, 3));
        _commitLeadFull(id, 0, leadA);
        _commitLeadFull(id, 1, leadB);
        _revealLeadFull(id, 0, leadA);
        _revealLeadFull(id, 1, leadB);

        Engine.Bout memory mirror = Engine.create(1, _mirrorLoadout(id, 0, leadA), _mirrorLoadout(id, 1, leadB));
        for (uint256 i = 0; i < 60 && _phase(id) != Arena.Phase.Over; i++) {
            Arena.Phase ph = _phase(id);
            if (ph == Arena.Phase.TurnCommit) {
                uint8[] memory la = Engine.legalActions(mirror, 0);
                uint8[] memory lb = Engine.legalActions(mirror, 1);
                uint8 a = la[_pick(seed, i * 2 + 10, la.length)];
                uint8 b = lb[_pick(seed, i * 2 + 11, lb.length)];
                _round(id, a, b);
                Engine.resolveTurn(mirror, a, b);
            } else if (ph == Arena.Phase.ReplaceCommit) {
                _fuzzReplace(id, mirror, seed, i);
            } else if (ph == Arena.Phase.OpenCards) {
                _doOpenPhase(id);
            } else {
                revert("unexpected phase");
            }
        }
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over), "terminated");
        _openRest(id);
        assertEq(keccak256(arena.getState(id)), keccak256(BoutCodec.pack(mirror)), "hidden-hand Arena == full-information engine");
    }

    function _fuzzReplace(uint256 id, Engine.Bout memory mirror, uint256 seed, uint256 i) internal {
        (,,,,,,, bool[2] memory needs,,) = arena.getBout(id);
        uint8 t = _turnNow(id);
        uint8[2] memory pick;
        for (uint8 s = 0; s < 2; s++) {
            if (!needs[s]) continue;
            pick[s] = _alivePick(mirror, s, _pick(seed, i * 5 + 100 + s, 3));
            _commitStd(id, s, TAG_REPLACE, t, pick[s]);
        }
        for (uint8 s = 0; s < 2; s++) if (needs[s]) _revealAuto(id, s, TAG_REPLACE, t, pick[s], true);
        // the mirror is told every side's choice; a side that needed none ignores its value
        Engine.applyReplacements(mirror, pick[0], pick[1]);
    }

    function _alivePick(Engine.Bout memory bt, uint8 s, uint256 r) internal pure returns (uint8) {
        uint8 n;
        for (uint8 k = 0; k < bt.s[s].nF; k++) if (bt.s[s].f[k].alive) n++;
        uint256 want = r % n;
        uint256 seen;
        for (uint8 k = 0; k < bt.s[s].nF; k++) {
            if (bt.s[s].f[k].alive) {
                if (seen == want) return k;
                seen++;
            }
        }
        return 0;
    }
}
