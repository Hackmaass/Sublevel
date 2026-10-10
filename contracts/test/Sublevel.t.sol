// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Cards} from "../src/Cards.sol";
import {Armory} from "../src/Armory.sol";
import {Arena} from "../src/Arena.sol";
import {Ladder} from "../src/Ladder.sol";
import {Engine} from "../src/Engine.sol";
import {BoutCodec} from "../src/BoutCodec.sol";
import {Bootstrap} from "../src/Bootstrap.sol";

contract SublevelTest is Test {
    Cards cards;
    Armory armory;
    Arena arena;
    Ladder ladder;

    address carol = makeAddr("carol");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory");
    address sessionKey = makeAddr("sessionKey");

    uint8 constant TAG_LEAD = 0;
    uint8 constant TAG_ACTION = 1;
    uint8 constant TAG_REPLACE = 2;

    function setUp() public {
        vm.warp(1_000_000);
        cards = new Cards();
        armory = new Armory(cards);
        ladder = new Ladder();
        arena = new Arena(cards, armory, ladder, true); // Full enabled so tests can exercise the replacement path
        cards.wire(address(armory), address(arena));
        armory.wire(address(arena));
        ladder.wire(address(arena));
    }

    /* ======================= helpers ======================= */
    function _starter(address who, uint8 pa, uint8 pb, uint8 trickId) internal returns (uint256[] memory ids) {
        vm.prank(who);
        (uint256 f0, uint256 f1, uint256 t0) = cards.claimStarter(pa, pb, trickId);
        ids = new uint256[](3);
        ids[0] = f0;
        ids[1] = f1;
        ids[2] = t0;
    }

    function _litePool(address who, uint8 pa, uint8 pb, uint8 trickId) internal returns (uint256 poolId) {
        uint256[] memory ids = _starter(who, pa, pb, trickId);
        vm.prank(who);
        poolId = armory.register(0, ids);
    }

    function _fullPool(address who, uint8 seed) internal returns (uint256 poolId) {
        uint256[] memory s = _starter(who, seed % 12, (seed + 5) % 12, seed % 6);
        uint256[] memory ids = new uint256[](8);
        ids[0] = s[0];
        ids[1] = s[1];
        ids[2] = s[2];
        vm.startPrank(who);
        vm.warp(block.timestamp + 6);
        ids[3] = cards.mintFighter(0, 0, 3, 1, bytes32(0), "", "Extra Dog");
        vm.warp(block.timestamp + 6);
        ids[4] = cards.mintFighter(1, 7, 10, 0, bytes32(0), "", "Extra Nails");
        vm.warp(block.timestamp + 6);
        ids[5] = cards.mintFighter(2, 12, 16, 2, bytes32(0), "", "Extra Glass");
        vm.warp(block.timestamp + 6);
        ids[6] = cards.mintTrick((seed + 1) % 6, bytes32(0), "", "Extra Trick");
        vm.warp(block.timestamp + 6);
        ids[7] = cards.mintTrick((seed + 2) % 6, bytes32(0), "", "Extra Trick Two");
        poolId = armory.register(1, ids);
        vm.stopPrank();
    }

    function _player(uint256 boutId, uint8 side) internal view returns (address) {
        (address[2] memory p,,,,,,,,,) = arena.getBout(boutId);
        return p[side];
    }

    function _phase(uint256 boutId) internal view returns (Arena.Phase ph) {
        (,,, ph,,,,,,) = arena.getBout(boutId);
    }

    function _result(uint256 boutId) internal view returns (int8 winner, uint8 reason) {
        (,,,,,,,, winner, reason) = arena.getBout(boutId);
    }

    function _startBout(uint8 format, uint256 poolA, uint256 poolB) internal returns (uint256 boutId) {
        vm.prank(alice);
        boutId = arena.createChallenge(format, poolA);
        vm.prank(bob);
        arena.acceptChallenge(boutId, poolB);
    }

    function _salt(uint256 id, uint8 side, uint8 tag, uint8 turn) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", id, side, tag, turn));
    }

    function _turn(uint256 id) internal view returns (uint8) {
        return uint8(arena.getState(id)[3]);
    }

    function _hash(uint256 id, uint8 side, uint8 tag, uint8 turn, uint8 choice) internal view returns (bytes32) {
        bytes32 salt = _salt(id, side, tag, turn);
        return arena.commitHashOf(id, turn, tag, _player(id, side), choice, salt);
    }

    function _commit(uint256 id, uint8 side, uint8 tag, uint8 turn, uint8 choice) internal {
        bytes32 h = _hash(id, side, tag, turn, choice);
        vm.prank(_player(id, side));
        arena.commit(id, side, h);
    }

    function _reveal(uint256 id, uint8 side, uint8 tag, uint8 turn, uint8 choice) internal {
        vm.prank(_player(id, side));
        arena.reveal(id, side, choice, _salt(id, side, tag, turn));
    }

    function _round(uint256 id, uint8 tag, uint8 turn, uint8 cA, uint8 cB) internal {
        _commit(id, 0, tag, turn, cA);
        _commit(id, 1, tag, turn, cB);
        _reveal(id, 0, tag, turn, cA);
        _reveal(id, 1, tag, turn, cB);
    }

    function _rand(uint256 seed, uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i)));
    }

    function _isLocked(uint256 poolId) internal view returns (bool) {
        uint256[] memory ids = armory.poolIds(poolId);
        for (uint256 i = 0; i < ids.length; i++) if (cards.locked(ids[i])) return true;
        return false;
    }

    function _assertReleased(uint256 boutId) internal view {
        (, uint256[2] memory pool,,,,,,,,) = arena.getBout(boutId);
        for (uint8 s = 0; s < 2; s++) {
            (,,,, bool inBout) = armory.poolInfo(pool[s]);
            assertFalse(inBout, "pool still flagged in bout");
        }
    }

    /* ======================= wiring / cards ======================= */
    function test_wiring_is_set_once_and_deployer_only() public {
        Cards c = new Cards();
        vm.prank(mallory);
        vm.expectRevert(Cards.NotDeployer.selector);
        c.wire(mallory, mallory);
        c.wire(address(1), address(2));
        vm.expectRevert(Cards.AlreadyWired.selector);
        c.wire(address(3), address(4));
        // armory likewise
        Armory a = new Armory(c);
        vm.prank(mallory);
        vm.expectRevert(Armory.NotDeployer.selector);
        a.wire(mallory);
        a.wire(address(2));
        vm.expectRevert(Armory.AlreadyWired.selector);
        a.wire(address(5));
    }

    function test_only_arena_writes_records_and_only_armory_locks() public {
        uint256[] memory ids = _starter(alice, 0, 4, 0);
        vm.prank(mallory);
        vm.expectRevert(Cards.NotArena.selector);
        cards.recordBout(ids[0], 1, false);
        vm.prank(address(this)); // the deployer has no special power after wiring
        vm.expectRevert(Cards.NotArena.selector);
        cards.recordBout(ids[0], 1, false);
        uint256[] memory one = new uint256[](1);
        one[0] = ids[0];
        vm.prank(alice);
        vm.expectRevert(Cards.NotArmory.selector);
        cards.setLocked(one, true);
    }

    function test_mint_rules() public {
        vm.startPrank(alice);
        uint256 id = cards.mintFighter(0, 0, 3, 1, keccak256("art"), "ipfs://bafyart", "Tin Man");
        assertEq(cards.ownerOf(id), alice);
        // cooldown
        vm.expectRevert();
        cards.mintFighter(0, 0, 3, 1, bytes32(0), "", "Again");
        vm.warp(block.timestamp + 6);
        // illegal builds: two light attacks; wrong style attack; same attack twice; bad spread
        vm.expectRevert(Cards.IllegalBuild.selector);
        cards.mintFighter(0, 0, 1, 1, bytes32(0), "", "Two Light"); // Jab + Hook (both light)
        vm.expectRevert(Cards.IllegalBuild.selector);
        cards.mintFighter(0, 0, 9, 1, bytes32(0), "", "Wrong Style"); // Jab + Takedown (CLINCH)
        vm.expectRevert(Cards.IllegalBuild.selector);
        cards.mintFighter(0, 3, 3, 1, bytes32(0), "", "Same Twice");
        vm.expectRevert(Cards.IllegalBuild.selector);
        cards.mintFighter(0, 0, 3, 9, bytes32(0), "", "Bad Spread");
        // text safety: no quotes/markup in names or URIs
        vm.expectRevert(Cards.BadText.selector);
        cards.mintFighter(0, 0, 3, 1, bytes32(0), "", 'Bad"Name');
        vm.expectRevert(Cards.BadText.selector);
        cards.mintFighter(0, 0, 3, 1, bytes32(0), "<script>", "Fine Name");
        vm.expectRevert(Cards.BadText.selector);
        cards.mintFighter(0, 0, 3, 1, bytes32(0), "", "");
        vm.stopPrank();
    }

    function test_starter_once_and_tokenURI() public {
        _starter(alice, 0, 4, 0);
        vm.prank(alice);
        vm.expectRevert(Cards.StarterClaimed.selector);
        cards.claimStarter(1, 2, 3);
        string memory uri = cards.tokenURI(0);
        assertTrue(bytes(uri).length > 200);
        assertEq(_slice(uri, 0, 29), "data:application/json;base64,");
        assertTrue(cards.supportsInterface(0x49064906), "ERC-4906");
        assertTrue(cards.supportsInterface(0x80ac58cd), "ERC-721");
    }

    function _slice(string memory s, uint256 a, uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(n);
        for (uint256 i = 0; i < n; i++) o[i] = b[a + i];
        return string(o);
    }

    /* ======================= armory / locks / session scope ======================= */
    function test_pool_locks_cards_and_blocks_transfer() public {
        uint256 pool = _litePool(alice, 0, 4, 0);
        uint256[] memory ids = armory.poolIds(pool);
        assertTrue(cards.locked(ids[0]) && cards.locked(ids[2]));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Cards.Locked.selector, ids[0]));
        cards.transferFrom(alice, bob, ids[0]);
        // one pool at a time
        vm.prank(alice);
        vm.expectRevert();
        armory.register(0, ids);
        // unregister releases
        vm.prank(alice);
        armory.unregister(pool);
        assertFalse(cards.locked(ids[0]));
        vm.prank(alice);
        cards.transferFrom(alice, bob, ids[0]);
        assertEq(cards.ownerOf(ids[0]), bob);
    }

    function test_pool_composition_and_ownership_rules() public {
        uint256[] memory a = _starter(alice, 0, 4, 0);
        uint256[] memory b = _starter(bob, 1, 5, 1);
        // can't register someone else's card
        uint256[] memory stolen = new uint256[](3);
        stolen[0] = a[0];
        stolen[1] = b[1];
        stolen[2] = a[2];
        vm.prank(alice);
        vm.expectRevert();
        armory.register(0, stolen);
        // wrong composition (3 fighters-like): 2 fighters + 1 trick required
        uint256[] memory wrong = new uint256[](3);
        wrong[0] = a[0];
        wrong[1] = a[1];
        wrong[2] = a[1];
        vm.prank(alice);
        vm.expectRevert();
        armory.register(0, wrong);
        // wrong size
        uint256[] memory two = new uint256[](2);
        two[0] = a[0];
        two[1] = a[1];
        vm.prank(alice);
        vm.expectRevert();
        armory.register(0, two);
    }

    function test_session_key_can_play_but_never_touch_cards_or_bouts_setup() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 1, 5, 1);
        vm.prank(alice);
        armory.authorizeSession(sessionKey, uint64(block.timestamp + 1 hours));
        uint256[] memory ids = armory.poolIds(poolA);

        // the session key can NOT register/unregister/create/accept/cancel/transfer/approve
        vm.startPrank(sessionKey);
        vm.expectRevert();
        armory.unregister(poolA);
        vm.expectRevert();
        arena.createChallenge(0, poolA);
        vm.expectRevert();
        cards.transferFrom(alice, sessionKey, ids[0]);
        vm.expectRevert();
        cards.approve(sessionKey, ids[0]);
        vm.stopPrank();

        uint256 boutId = _startBout(0, poolA, poolB);
        // mallory (no delegation) can't play Alice's seat
        vm.prank(mallory);
        vm.expectRevert(Arena.NotYourSeat.selector);
        arena.commit(boutId, 0, bytes32(uint256(1)));
        // the session key CAN commit/reveal for Alice
        bytes32 h = arena.commitHashOf(boutId, 0, TAG_LEAD, alice, 0, _salt(boutId, 0, TAG_LEAD, 0));
        vm.prank(sessionKey);
        arena.commit(boutId, 0, h);
        // …but not for Bob (it's only authorised by Alice)
        vm.prank(sessionKey);
        vm.expectRevert(Arena.NotYourSeat.selector);
        arena.commit(boutId, 1, bytes32(uint256(2)));
        // revoke → no longer works
        vm.prank(alice);
        armory.revokeSession(sessionKey);
        vm.prank(sessionKey);
        vm.expectRevert(Arena.NotYourSeat.selector);
        arena.reveal(boutId, 0, 0, _salt(boutId, 0, TAG_LEAD, 0));
    }

    /* ======================= commit domain separation ======================= */
    function test_commit_hash_is_domain_separated() public view {
        bytes32 salt = keccak256("s");
        bytes32 base = arena.commitHashOf(7, 3, TAG_ACTION, alice, 2, salt);
        assertTrue(base != arena.commitHashOf(8, 3, TAG_ACTION, alice, 2, salt), "bout");
        assertTrue(base != arena.commitHashOf(7, 4, TAG_ACTION, alice, 2, salt), "turn");
        assertTrue(base != arena.commitHashOf(7, 3, TAG_REPLACE, alice, 2, salt), "phase tag: an action salt can't open a replacement commit");
        assertTrue(base != arena.commitHashOf(7, 3, TAG_LEAD, alice, 2, salt), "phase tag (lead)");
        assertTrue(base != arena.commitHashOf(7, 3, TAG_ACTION, bob, 2, salt), "player");
        assertTrue(base != arena.commitHashOf(7, 3, TAG_ACTION, alice, 3, salt), "choice");
    }

    /* ======================= a full Lite bout ======================= */
    function _playToEnd(uint256 boutId, uint256 seed) internal returns (uint256 turns) {
        // leads
        _round(boutId, TAG_LEAD, 0, uint8(_rand(seed, 1) % 2), uint8(_rand(seed, 2) % 2));
        Engine.Bout memory mirror = BoutCodec.unpack(arena.getState(boutId));
        for (uint256 i = 0; i < 40 && _phase(boutId) != Arena.Phase.Over; i++) {
            Arena.Phase ph = _phase(boutId);
            Engine.Bout memory bt = BoutCodec.unpack(arena.getState(boutId));
            assertEq(keccak256(BoutCodec.pack(bt)), keccak256(BoutCodec.pack(mirror)), "arena state == engine mirror");
            if (ph == Arena.Phase.TurnCommit) {
                uint8[] memory la = Engine.legalActions(bt, 0);
                uint8[] memory lb = Engine.legalActions(bt, 1);
                uint8 a = la[_rand(seed, i * 2 + 10) % la.length];
                uint8 b = lb[_rand(seed, i * 2 + 11) % lb.length];
                _round(boutId, TAG_ACTION, bt.turn, a, b);
                Engine.resolveTurn(mirror, a, b);
                turns++;
            } else if (ph == Arena.Phase.ReplaceCommit) {
                // only the sides that must really choose participate
                bool[2] memory needs = _needs(boutId);
                uint8 c0;
                uint8 c1;
                for (uint8 s = 0; s < 2; s++) {
                    if (!needs[s]) continue;
                    uint8 pick = _firstAlive(bt, s, _rand(seed, i * 3 + 100 + s));
                    if (s == 0) c0 = pick;
                    else c1 = pick;
                    _commit(boutId, s, TAG_REPLACE, bt.turn, pick);
                }
                for (uint8 s = 0; s < 2; s++) if (needs[s]) _reveal(boutId, s, TAG_REPLACE, bt.turn, s == 0 ? c0 : c1);
                // mirror: forced for the other side
                uint8 m0 = needs[0] ? c0 : _forcedSlot(mirror, 0);
                uint8 m1 = needs[1] ? c1 : _forcedSlot(mirror, 1);
                Engine.applyReplacements(mirror, m0, m1);
            } else {
                revert("unexpected phase");
            }
        }
        assertEq(uint8(_phase(boutId)), uint8(Arena.Phase.Over), "bout terminated");
    }

    function _needs(uint256 boutId) internal view returns (bool[2] memory needs) {
        (,,,,,,, needs,,) = arena.getBout(boutId);
    }

    function _firstAlive(Engine.Bout memory bt, uint8 s, uint256 r) internal pure returns (uint8) {
        uint8 n;
        for (uint8 i = 0; i < bt.s[s].nF; i++) if (bt.s[s].f[i].alive) n++;
        uint8 want = uint8(r % n);
        uint8 k;
        for (uint8 i = 0; i < bt.s[s].nF; i++) {
            if (bt.s[s].f[i].alive) {
                if (k == want) return i;
                k++;
            }
        }
        return 0;
    }

    function _forcedSlot(Engine.Bout memory bt, uint8 s) internal pure returns (uint8) {
        for (uint8 i = 0; i < bt.s[s].nF; i++) if (bt.s[s].f[i].alive) return i;
        return 0;
    }

    function test_lite_bout_end_to_end_records_and_locks() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 boutId = _startBout(0, poolA, poolB);
        assertTrue(_isLocked(poolA) && _isLocked(poolB));
        _playToEnd(boutId, 777);
        assertEq(uint8(_phase(boutId)), uint8(Arena.Phase.Over));
        _assertReleased(boutId);
        // locks released? (cards stay locked until the owner unregisters the pool — by design — but the pool is free to re-enter)
        (int8 winner,) = _result(boutId);
        assertTrue(winner >= 0);

        // records consistent: wins + losses + draws == bouts for every card; only the Arena wrote them
        uint256[] memory ids = armory.poolIds(poolA);
        uint256 played;
        for (uint256 i = 0; i < ids.length; i++) {
            Cards.Record memory r = cards.recordOf(ids[i]);
            assertEq(uint256(r.wins) + r.losses + r.draws, r.bouts, "record sums to bouts");
            played += r.bouts;
        }
        assertGt(played, 0, "somebody got a career entry");
        // pools are reusable: same pool can open another challenge
        vm.prank(alice);
        uint256 again = arena.createChallenge(0, poolA);
        assertEq(uint8(_phase(again)), uint8(Arena.Phase.Open));
    }

    /* ======================= forfeits, timeouts, exits ======================= */
    function test_bad_reveal_forfeits() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 id = _startBout(0, poolA, poolB);
        _commit(id, 0, TAG_LEAD, 0, 0);
        _commit(id, 1, TAG_LEAD, 0, 1);
        // Alice commits to lead 0 but reveals lead 1 → forfeit, Bob wins
        vm.prank(alice);
        arena.reveal(id, 0, 1, _salt(id, 0, TAG_LEAD, 0));
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over));
        (int8 w, uint8 reason) = _result(id);
        assertEq(w, 1);
        assertEq(reason, Engine.REASON_FORFEIT);
        _assertReleased(id);
    }

    function test_illegal_action_forfeits() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 id = _startBout(0, poolA, poolB);
        _round(id, TAG_LEAD, 0, 0, 0);
        // Alice commits a heavy attack she cannot afford (start Grit 2): attack 2 of Rust Dog is Haymaker (cost 4)
        _commit(id, 0, TAG_ACTION, 0, 1);
        _commit(id, 1, TAG_ACTION, 0, 2);
        _reveal(id, 1, TAG_ACTION, 0, 2);
        _reveal(id, 0, TAG_ACTION, 0, 1);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Over));
        (int8 w, uint8 reason) = _result(id);
        assertEq(w, 1);
        assertEq(reason, Engine.REASON_FORFEIT);
        _assertReleased(id);
    }

    function test_non_reveal_forfeits_and_honest_side_can_claim() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 id = _startBout(0, poolA, poolB);
        _round(id, TAG_LEAD, 0, 0, 0);
        _commit(id, 0, TAG_ACTION, 0, 2);
        _commit(id, 1, TAG_ACTION, 0, 2);
        _reveal(id, 0, TAG_ACTION, 0, 2); // Alice reveals, Bob sits on it
        // too early
        vm.prank(alice);
        vm.expectRevert(Arena.NotExpired.selector);
        arena.claimTimeout(id);
        vm.warp(block.timestamp + 91);
        // Bob can't reveal late
        vm.prank(bob);
        vm.expectRevert(Arena.BadPhase.selector);
        arena.reveal(id, 1, 2, _salt(id, 1, TAG_ACTION, 0));
        vm.prank(mallory); // anyone may claim
        arena.claimTimeout(id);
        (int8 w, uint8 reason) = _result(id);
        assertEq(w, 0, "the side that did not reveal forfeits");
        assertEq(reason, Engine.REASON_FORFEIT);
        _assertReleased(id);
    }

    function test_both_missing_voids_and_releases() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 id = _startBout(0, poolA, poolB);
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.Void));
        _assertReleased(id);
        // no career entries for a voided bout
        uint256[] memory ids = armory.poolIds(poolA);
        assertEq(cards.recordOf(ids[0]).bouts, 0);
    }

    function test_one_side_missing_commit_forfeits() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 id = _startBout(0, poolA, poolB);
        _commit(id, 1, TAG_LEAD, 0, 0); // only Bob commits
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id);
        (int8 w,) = _result(id);
        assertEq(w, 1);
        _assertReleased(id);
    }

    function test_challenge_cancel_expire_selfplay_and_wrong_format() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        vm.prank(alice);
        uint256 id = arena.createChallenge(0, poolA);
        // pool is busy
        vm.prank(alice);
        vm.expectRevert();
        arena.createChallenge(0, poolA);
        // can't accept your own challenge
        address carol = makeAddr("carol");
        uint256 poolC = _litePool(carol, 1, 5, 2);
        vm.prank(alice);
        vm.expectRevert(Arena.SelfPlay.selector);
        arena.acceptChallenge(id, poolC);
        // only the creator cancels
        vm.prank(bob);
        vm.expectRevert(Arena.NotCreator.selector);
        arena.cancelChallenge(id);
        vm.prank(alice);
        arena.cancelChallenge(id);
        (,,,bool active, bool inBout) = armory.poolInfo(poolA);
        assertTrue(active && !inBout);
        // expiry
        vm.prank(alice);
        uint256 id2 = arena.createChallenge(0, poolA);
        vm.expectRevert(Arena.NotExpired.selector);
        arena.expireChallenge(id2);
        vm.warp(block.timestamp + 1 hours + 1);
        arena.expireChallenge(id2);
        (,,, inBout) = _poolFlags(poolA);
        assertFalse(inBout);
        // wrong format pool
        uint256 full = _fullPool(bob, 3);
        vm.prank(bob);
        vm.expectRevert();
        arena.createChallenge(0, full);
    }

    function _poolFlags(uint256 pool) internal view returns (address o, uint8 f, uint8 n, bool inBout) {
        bool active;
        (o, f, n, active, inBout) = armory.poolInfo(pool);
        active;
    }

    function test_full_disabled_in_production_config() public {
        Cards c = new Cards();
        Armory a = new Armory(c);
        Arena prod = new Arena(c, a, new Ladder(), false);
        c.wire(address(a), address(prod));
        a.wire(address(prod));
        vm.expectRevert(Arena.FullDisabled.selector);
        prod.createChallenge(1, 0);
    }

    /* ======================= one-transaction deployment ======================= */
    function test_bootstrap_deploys_a_fully_wired_system_nobody_can_rewire() public {
        // deployed by an arbitrary account (as a factory / smart wallet would): the caller gets NO power
        vm.prank(mallory);
        Bootstrap b = new Bootstrap(true);
        Cards c = b.cards();
        Armory a = b.armory();
        Arena r = b.arena();
        Ladder bl = b.ladder();
        assertEq(address(r.ladder()), address(bl), "the Arena settles into the Bootstrap's Ladder");
        assertEq(bl.arena(), address(r));
        vm.prank(mallory);
        vm.expectRevert();
        bl.wire(address(5));
        assertEq(c.deployer(), address(b), "the Bootstrap, not the human, was the deployer");
        assertTrue(r.fullEnabled());
        vm.prank(mallory);
        vm.expectRevert();
        c.wire(address(1), address(2));
        vm.prank(address(b)); // even the Bootstrap itself has no function that could call wire again
        vm.expectRevert();
        c.wire(address(1), address(2));
        vm.prank(mallory);
        vm.expectRevert();
        a.wire(address(3));
        // and it works: a Lite bout can be created end to end
        vm.startPrank(alice);
        (uint256 f0, uint256 f1, uint256 t0) = c.claimStarter(0, 4, 0);
        uint256[] memory ids = new uint256[](3);
        ids[0] = f0;
        ids[1] = f1;
        ids[2] = t0;
        uint256 pool = a.register(0, ids);
        uint256 id = r.createChallenge(0, pool);
        vm.stopPrank();
        assertEq(id, 0);
    }

    /* ======================= ranked queue, rating and the Belt ======================= */
    /// @dev a ranked bout whose winner is decided by the other side not revealing (deterministic, cheap)
    function _rankedBout(address first, uint256 poolFirst, address second, uint256 poolSecond, address winner) internal returns (uint256 id) {
        vm.prank(first);
        (bool queued,) = arena.joinRanked(0, poolFirst);
        assertFalse(queued, "first entrant waits");
        vm.prank(second);
        (bool matched, uint256 bid) = arena.joinRanked(0, poolSecond);
        assertTrue(matched, "second entrant is paired at once");
        id = bid;
        _round(id, TAG_LEAD, 0, 0, 0);
        _commit(id, 0, TAG_ACTION, 0, 2);
        _commit(id, 1, TAG_ACTION, 0, 2);
        _reveal(id, winner == first ? 0 : 1, TAG_ACTION, 0, 2);
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id);
        (int8 w,) = _result(id);
        assertEq(w, winner == first ? int8(0) : int8(1));
    }

    function test_ladder_is_wired_once_and_only_the_arena_settles() public {
        vm.expectRevert(Ladder.NotArena.selector);
        ladder.settle(0, alice, bob, 0, 1);
        vm.prank(mallory);
        vm.expectRevert(Ladder.NotArena.selector);
        ladder.settle(0, alice, bob, 0, 1);
        vm.expectRevert(Ladder.AlreadyWired.selector);
        ladder.wire(address(1));
        Ladder fresh = new Ladder();
        vm.prank(mallory);
        vm.expectRevert(Ladder.NotDeployer.selector);
        fresh.wire(address(1));
    }

    function test_elo_expected_score_is_symmetric_monotone_and_anchored() public view {
        assertEq(ladder.expectedPermille(0), 500);
        assertEq(ladder.expectedPermille(400), 909);
        assertEq(ladder.expectedPermille(-400), 91);
        int256 prev = ladder.expectedPermille(-1000);
        for (int256 d = -1000; d <= 1000; d += 7) {
            int256 e = ladder.expectedPermille(d);
            assertEq(e + ladder.expectedPermille(-d), 1000, "E(d) + E(-d) = 1");
            assertGe(e, prev, "monotone");
            assertTrue(e > 0 && e < 1000, "never certain");
            prev = e;
        }
    }

    function test_ranked_queue_pairs_first_come_and_releases_pools() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        vm.prank(alice);
        (bool matched,) = arena.joinRanked(0, poolA);
        assertFalse(matched);
        (address who, uint256 pool, uint64 exp) = arena.waiting(0);
        assertEq(who, alice);
        assertEq(pool, poolA);
        assertEq(exp, uint64(block.timestamp) + arena.RANKED_TTL());
        (,,,, bool inBout) = armory.poolInfo(poolA);
        assertTrue(inBout, "a queued pool is flagged so it can't be used twice");

        vm.prank(bob);
        (bool m2, uint256 id) = arena.joinRanked(0, poolB);
        assertTrue(m2);
        assertTrue(arena.ranked(id));
        assertEq(_player(id, 0), alice, "the earlier entrant takes seat 0");
        assertEq(_player(id, 1), bob);
        assertEq(uint8(_phase(id)), uint8(Arena.Phase.LeadCommit));
        (who,,) = arena.waiting(0);
        assertEq(who, address(0), "queue is empty again");
    }

    function test_ranked_queue_edges_selfplay_leave_expire() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolA2 = _litePool(carol, 1, 6, 2); // carol stands in as a second pool-holder
        vm.prank(alice);
        arena.joinRanked(0, poolA);
        // alice can't play herself
        uint256 spare = _litePoolAgain(alice);
        vm.prank(alice);
        vm.expectRevert(Arena.SelfPlay.selector);
        arena.joinRanked(0, spare);
        // a stranger can't pull her out; she can leave herself
        vm.prank(mallory);
        vm.expectRevert(Arena.NotCreator.selector);
        arena.leaveRanked(0);
        // nobody may expire a fresh entry
        vm.expectRevert(Arena.NotExpired.selector);
        arena.expireRanked(0);
        // after the TTL anyone clears it, and the pool is free again
        vm.warp(block.timestamp + arena.RANKED_TTL() + 1);
        arena.expireRanked(0);
        (,,,, bool inBout) = armory.poolInfo(poolA);
        assertFalse(inBout);
        // an expired waiter is swept by the next joiner, who then waits
        vm.prank(alice);
        arena.joinRanked(0, poolA);
        vm.warp(block.timestamp + arena.RANKED_TTL() + 1);
        vm.prank(carol);
        (bool matched,) = arena.joinRanked(0, poolA2);
        assertFalse(matched, "an expired entrant is not matched; the new joiner waits instead");
        (address who,,) = arena.waiting(0);
        assertEq(who, carol);
        (,,,, bool aliceBusy) = armory.poolInfo(poolA);
        assertFalse(aliceBusy, "the expired entrant's pool was released");
        vm.prank(carol);
        arena.leaveRanked(0);
        (who,,) = arena.waiting(0);
        assertEq(who, address(0));
    }

    function test_an_expired_entrant_can_requeue_with_the_same_pool() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        vm.prank(alice);
        arena.joinRanked(0, poolA);
        vm.warp(block.timestamp + arena.RANKED_TTL() + 1);
        vm.prank(alice); // nobody called expireRanked; her pool is still flagged from her own stale entry
        (bool matched,) = arena.joinRanked(0, poolA);
        assertFalse(matched);
        (address who, uint256 pool, uint64 exp) = arena.waiting(0);
        assertEq(who, alice);
        assertEq(pool, poolA);
        assertGt(exp, block.timestamp);
    }

    /// @dev alice's 2nd pool (cards are minted free, cooldown applies)
    function _litePoolAgain(address who) internal returns (uint256 poolId) {
        vm.warp(block.timestamp + 6);
        vm.startPrank(who);
        uint256[] memory ids = new uint256[](3);
        ids[0] = cards.mintFighter(0, 1, 5, 1, bytes32(0), "", "Spare One");
        vm.warp(block.timestamp + 6);
        ids[1] = cards.mintFighter(1, 7, 10, 0, bytes32(0), "", "Spare Two");
        vm.warp(block.timestamp + 6);
        ids[2] = cards.mintTrick(0, bytes32(0), "", "Spare Trick");
        poolId = armory.register(0, ids);
        vm.stopPrank();
    }

    function test_ranked_rating_is_zero_sum_and_crowns_the_first_winner() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        assertEq(ladder.ratingOf(0, alice), 1000, "everyone starts at 1000");
        _rankedBout(alice, poolA, bob, poolB, alice);
        int32 ra = ladder.ratingOf(0, alice);
        int32 rb = ladder.ratingOf(0, bob);
        assertEq(ra, 1016, "even match: K/2 gained");
        assertEq(rb, 984, "...and lost by the other side");
        assertEq(ra + rb, 2000, "zero-sum");
        (, uint32 bouts, uint32 wins, uint32 losses, uint32 draws) = ladder.standingOf(0, alice);
        assertEq(bouts, 1);
        assertEq(wins, 1);
        assertEq(losses + draws, 0);
        (address holder,, uint32 defenses, uint32 reigns) = ladder.reignOf(0);
        assertEq(holder, alice, "first decisive ranked win crowns");
        assertEq(reigns, 1);
        assertEq(defenses, 0);
        assertEq(ladder.ownerOf(0), alice);
        (address fullHolder,,,) = ladder.reignOf(1);
        assertEq(fullHolder, address(0), "Lite and Full have separate belts");
        assertEq(ladder.ratingOf(1, alice), 1000, "and separate ratings");
        assertGt(bytes(ladder.tokenURI(0)).length, 100);
    }

    function test_belt_only_moves_when_the_holder_loses_and_is_soulbound() public {
        address dave = makeAddr("dave");
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 poolC = _litePool(carol, 1, 6, 2);
        poolB; // keep names symmetrical
        dave;
        _rankedBout(alice, poolA, bob, poolB, alice); // alice crowned
        _rankedBout(bob, poolB, carol, poolC, bob); // holder not involved: nothing moves
        (address holder,, uint32 defenses,) = ladder.reignOf(0);
        assertEq(holder, alice);
        assertEq(defenses, 0);
        _rankedBout(carol, poolC, alice, poolA, alice); // holder wins: a defence
        (holder,, defenses,) = ladder.reignOf(0);
        assertEq(holder, alice);
        assertEq(defenses, 1);
        assertEq(ladder.ownerOf(0), alice);
        _rankedBout(alice, poolA, bob, poolB, bob); // holder loses to bob: the belt changes hands
        uint32 reigns;
        (holder,, defenses, reigns) = ladder.reignOf(0);
        assertEq(holder, bob);
        assertEq(defenses, 0, "defences reset with the reign");
        assertEq(reigns, 2);
        assertEq(ladder.ownerOf(0), bob);
        // soulbound: the holder cannot sell, send or approve their way around the rule
        vm.prank(bob);
        vm.expectRevert(Ladder.Soulbound.selector);
        ladder.transferFrom(bob, carol, 0);
        vm.prank(bob);
        vm.expectRevert(Ladder.Soulbound.selector);
        ladder.safeTransferFrom(bob, carol, 0);
        assertEq(ladder.ownerOf(0), bob);
    }

    function test_unranked_challenge_play_never_touches_ratings_or_the_belt() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 id = _startBout(0, poolA, poolB);
        assertFalse(arena.ranked(id));
        _playToEnd(id, 4242);
        assertEq(ladder.ratingOf(0, alice), 1000);
        assertEq(ladder.ratingOf(0, bob), 1000);
        (address holder,,,) = ladder.reignOf(0);
        assertEq(holder, address(0));
    }

    function test_a_voided_ranked_bout_changes_nothing_but_a_walkout_costs_rating() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        vm.prank(alice);
        arena.joinRanked(0, poolA);
        vm.prank(bob);
        (, uint256 id) = arena.joinRanked(0, poolB);
        vm.warp(block.timestamp + 91); // nobody commits a lead: void
        arena.claimTimeout(id);
        assertEq(ladder.ratingOf(0, alice), 1000);
        assertEq(ladder.ratingOf(0, bob), 1000);
        (address holder,,,) = ladder.reignOf(0);
        assertEq(holder, address(0), "no one is crowned by a void");
        // one side walks out before the lead: that is a forfeit, and it is rated
        vm.prank(alice);
        arena.joinRanked(0, poolA);
        vm.prank(bob);
        (, uint256 id2) = arena.joinRanked(0, poolB);
        _commit(id2, 1, TAG_LEAD, 0, 0); // only bob commits a lead
        vm.warp(block.timestamp + 91);
        arena.claimTimeout(id2);
        (int8 w,) = _result(id2);
        assertEq(w, 1);
        assertEq(ladder.ratingOf(0, bob), 1016);
        assertEq(ladder.ratingOf(0, alice), 984);
    }

    function test_a_draw_moves_ratings_toward_each_other_but_not_the_belt() public {
        // upset the ratings first so a draw has something to move
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        _rankedBout(alice, poolA, bob, poolB, alice);
        vm.prank(address(arena));
        ladder.settle(0, alice, bob, 2, 999); // a draw, reported by the Arena
        assertLt(ladder.ratingOf(0, alice), 1016, "the favourite gives something back");
        assertGt(ladder.ratingOf(0, bob), 984);
        assertEq(ladder.ratingOf(0, alice) + ladder.ratingOf(0, bob), 2000);
        (address holder,,,) = ladder.reignOf(0);
        assertEq(holder, alice, "a draw never moves the belt");
    }

    function test_rating_gaps_stall_so_farming_a_hopeless_opponent_earns_nothing() public {
        vm.startPrank(address(arena));
        for (uint256 i = 0; i < 300; i++) ladder.settle(0, alice, bob, 1, i);
        int32 low = ladder.ratingOf(0, alice);
        int32 high = ladder.ratingOf(0, bob);
        for (uint256 i = 0; i < 300; i++) ladder.settle(0, alice, bob, 1, 1000 + i);
        vm.stopPrank();
        assertEq(ladder.ratingOf(0, alice), low, "once the gap is ~600 a win over them is worth less than a point");
        assertEq(ladder.ratingOf(0, bob), high);
        assertEq(low + high, 2000, "still zero-sum");
        assertGe(low, ladder.FLOOR());
    }

    function test_ranked_full_format_respects_the_deployment_switch() public {
        Cards c = new Cards();
        Armory a = new Armory(c);
        Ladder l = new Ladder();
        Arena prod = new Arena(c, a, l, false);
        c.wire(address(a), address(prod));
        a.wire(address(prod));
        l.wire(address(prod));
        vm.expectRevert(Arena.FullDisabled.selector);
        prod.joinRanked(1, 0);
    }

    function test_gas_profile_ranked() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 g;
        vm.prank(alice);
        g = gasleft();
        arena.joinRanked(0, poolA);
        console2.log("joinRanked (queue)       ", g - gasleft());
        vm.prank(bob);
        g = gasleft();
        (, uint256 id) = arena.joinRanked(0, poolB);
        console2.log("joinRanked (match, start)", g - gasleft());
        _round(id, TAG_LEAD, 0, 0, 0);
        _commit(id, 0, TAG_ACTION, 0, 2);
        _commit(id, 1, TAG_ACTION, 0, 2);
        _reveal(id, 0, TAG_ACTION, 0, 2);
        vm.warp(block.timestamp + 91);
        g = gasleft();
        arena.claimTimeout(id); // forfeit: first ranked settlement (cold ratings, belt mint)
        console2.log("claimTimeout (ranked, 1st settle + belt mint)", g - gasleft());
        // second settlement: warm-ish storage, belt defence
        vm.prank(alice);
        arena.joinRanked(0, poolA);
        vm.prank(bob);
        (, uint256 id2) = arena.joinRanked(0, poolB);
        _round(id2, TAG_LEAD, 0, 0, 0);
        _commit(id2, 0, TAG_ACTION, 0, 2);
        _commit(id2, 1, TAG_ACTION, 0, 2);
        _reveal(id2, 0, TAG_ACTION, 0, 2);
        vm.warp(block.timestamp + 91);
        g = gasleft();
        arena.claimTimeout(id2);
        console2.log("claimTimeout (ranked, repeat)", g - gasleft());
    }

    /// @dev the transaction that ENDS a ranked bout by KO does the most work in the whole system: it resolves the turn, writes every
    ///      played card's career entry, rates both players and (first time) mints the Belt. The client cannot know which reveal that
    ///      will be, so every resolving reveal in a ranked bout needs a limit that covers it.
    function test_gas_profile_ranked_ko_ending() public {
        uint256 best;
        for (uint256 seed = 1; seed < 40 && best == 0; seed++) {
            // fresh wallets per attempt so every attempt has a cold first settlement (ratings + belt mint), like a real first ranked KO
            address pa = makeAddr(string.concat("ra", vm.toString(seed)));
            address pb = makeAddr(string.concat("rb", vm.toString(seed)));
            uint256 poolA = _litePool(pa, uint8(_rand(seed, 1) % 12), uint8(_rand(seed, 2) % 12), uint8(_rand(seed, 3) % 6));
            uint256 poolB = _litePool(pb, uint8(_rand(seed, 4) % 12), uint8(_rand(seed, 5) % 12), uint8(_rand(seed, 6) % 6));
            vm.prank(pa);
            arena.joinRanked(0, poolA);
            vm.prank(pb);
            (, uint256 id) = arena.joinRanked(0, poolB);
            _round(id, TAG_LEAD, 0, uint8(_rand(seed, 7) % 2), uint8(_rand(seed, 8) % 2));
            uint256 lastReveal;
            while (_phase(id) == Arena.Phase.TurnCommit) {
                Engine.Bout memory bt = BoutCodec.unpack(arena.getState(id));
                uint8[] memory la = Engine.legalActions(bt, 0);
                uint8[] memory lb = Engine.legalActions(bt, 1);
                uint8 a = la[_rand(seed, bt.turn * 2 + 10) % la.length];
                uint8 b = lb[_rand(seed, bt.turn * 2 + 11) % lb.length];
                _commit(id, 0, TAG_ACTION, bt.turn, a);
                _commit(id, 1, TAG_ACTION, bt.turn, b);
                _reveal(id, 0, TAG_ACTION, bt.turn, a);
                bytes32 salt = _salt(id, 1, TAG_ACTION, bt.turn);
                vm.prank(_player(id, 1));
                uint256 g = gasleft();
                arena.reveal(id, 1, b, salt);
                lastReveal = g - gasleft();
            }
            (int8 w, uint8 reason) = _result(id);
            if (_phase(id) == Arena.Phase.Over && reason == Engine.REASON_KO && w >= 0 && w <= 1) {
                best = lastReveal;
                console2.log("last reveal of a ranked KO (resolve + records + settle + belt mint)", lastReveal);
            }
        }
        assertGt(best, 0, "found a KO-ending ranked bout");
        assertLt(best * 3, 3_000_000, "x3 for Monad's dearer cold storage must still fit reveal_resolving_ranked_end in gas-limits.json");
    }

    /* ======================= fuzz: random bouts, Arena == engine mirror ======================= */
    function testFuzz_lite_bouts_mirror_engine(uint256 seed) public {
        uint256 poolA = _litePool(alice, uint8(_rand(seed, 91) % 12), uint8(_rand(seed, 92) % 12), uint8(_rand(seed, 93) % 6));
        uint256 poolB = _litePool(bob, uint8(_rand(seed, 94) % 12), uint8(_rand(seed, 95) % 12), uint8(_rand(seed, 96) % 6));
        uint256 id = _startBout(0, poolA, poolB);
        _playToEnd(id, seed);
        _assertReleased(id);
        (int8 w,) = _result(id);
        assertTrue(w >= 0 && w <= 2);
    }

    /* ======================= gas profile (EVM-priced; Monad cold storage is ~4x — measure on testnet) ======================= */
    function test_gas_profile() public {
        uint256 poolA = _litePool(alice, 0, 4, 0);
        uint256 poolB = _litePool(bob, 3, 5, 1);
        uint256 g;

        vm.prank(alice);
        g = gasleft();
        uint256 id = arena.createChallenge(0, poolA);
        console2.log("createChallenge      ", g - gasleft());

        vm.prank(bob);
        g = gasleft();
        arena.acceptChallenge(id, poolB);
        console2.log("acceptChallenge      ", g - gasleft());

        // lead round
        bytes32 h0 = arena.commitHashOf(id, 0, TAG_LEAD, alice, 0, _salt(id, 0, TAG_LEAD, 0));
        bytes32 h1 = arena.commitHashOf(id, 0, TAG_LEAD, bob, 0, _salt(id, 1, TAG_LEAD, 0));
        vm.prank(alice);
        g = gasleft();
        arena.commit(id, 0, h0);
        console2.log("commit (1st)         ", g - gasleft());
        vm.prank(bob);
        g = gasleft();
        arena.commit(id, 1, h1);
        console2.log("commit (2nd, advance)", g - gasleft());
        vm.prank(alice);
        g = gasleft();
        arena.reveal(id, 0, 0, _salt(id, 0, TAG_LEAD, 0));
        console2.log("reveal lead (1st)    ", g - gasleft());
        vm.prank(bob);
        g = gasleft();
        arena.reveal(id, 1, 0, _salt(id, 1, TAG_LEAD, 0));
        console2.log("reveal lead (2nd, START)", g - gasleft());

        // one action turn
        _commit(id, 0, TAG_ACTION, 0, 2);
        _commit(id, 1, TAG_ACTION, 0, 2);
        vm.prank(alice);
        g = gasleft();
        arena.reveal(id, 0, 2, _salt(id, 0, TAG_ACTION, 0));
        console2.log("reveal action (1st)  ", g - gasleft());
        vm.prank(bob);
        g = gasleft();
        arena.reveal(id, 1, 2, _salt(id, 1, TAG_ACTION, 0));
        console2.log("reveal action (2nd, RESOLVE)", g - gasleft());

        // timeout claim
        vm.warp(block.timestamp + 91);
        g = gasleft();
        arena.claimTimeout(id);
        console2.log("claimTimeout (void)  ", g - gasleft());
    }
}
