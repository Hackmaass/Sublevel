// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Cards} from "./Cards.sol";
import {Armory} from "./Armory.sol";
import {Ladder} from "./Ladder.sol";
import {Engine} from "./Engine.sol";
import {BoutCodec} from "./BoutCodec.sol";
import {RulebookV1 as R} from "./RulebookV1.sol";

/// @title Arena — bouts, simultaneous secret moves (commit → reveal), timeouts and forfeits.
/// @notice The referee. It never sees a move before both are locked; it resolves each turn with the proven `Engine`;
///         it is the ONLY contract allowed to write card records.
///
/// FAIRNESS RULES (non-negotiable):
///  • Commit = keccak(chainId, arena, boutId, turn, PHASE_TAG, player, choice, salt). The phase tag separates lead / action /
///    replacement commits, so a salt revealed in one phase can never be used to attack a commit in another. Within a bout every
///    (side, tag, turn) is committed at most once (turn only advances when an action resolves, replacements sit between turns).
///  • Strict phases: a turn is fully revealed and resolved before the next commit window opens.
///  • A reveal that doesn't match its commit, or is illegal, FORFEITS the bout. A missed deadline forfeits (both missing → void).
///  • A session key may only commit/reveal/open. Creating, accepting, cancelling and everything about cards needs the owner wallet.
///
/// FULL (hidden loadout): each player locks 5 SLOT HASHES (3 fighters + 2 tricks) inside the lead commit. A slot hash is
///         keccak(chain, arena, bout, side, slot, cardId, slotSalt) — blinded per slot, so the public 8-card pool can't be brute-forced.
///         A card is OPENED (cardId + salt) in the same transaction as the reveal that first needs it (lead / switch / trick /
///         replacement). Every opening must match its slot hash, be in the locked pool, match the slot's kind, and not repeat a
///         card. A bad opening forfeits; a missing one reverts (the tx simply fails). The turn-cap decision and sudden-death
///         re-entry are the only rules that read unplayed roster data: the Engine pauses there (PHASE_OPEN → OpenCards) and both
///         sides open exactly what is needed before the bout can finish.
contract Arena {
    Cards public immutable cards;
    Armory public immutable armory;
    /// @notice ranked ratings + the Belt; written only from `_finish` of a ranked bout
    Ladder public immutable ladder;

    /// @notice Whether the Full (hidden-loadout, 3v3) format can be played on this deployment.
    bool public immutable fullEnabled;

    uint64 public constant PHASE_TIMEOUT = 90 seconds; // generous on purpose: slow RPCs / Monad's 1-tx-per-3-blocks rule must not forfeit anyone by accident
    uint64 public constant CHALLENGE_TTL = 1 hours;
    uint64 public constant RANKED_TTL = 10 minutes; // a waiting entrant is released after this

    uint8 internal constant TAG_LEAD = 0;
    uint8 internal constant TAG_ACTION = 1;
    uint8 internal constant TAG_REPLACE = 2;

    uint8 internal constant SLOTS = 5; // Full: 3 fighters then 2 tricks
    uint8 internal constant FIGHTER_SLOTS = 3;

    enum Phase {
        None,
        Open,
        LeadCommit,
        LeadReveal,
        TurnCommit,
        TurnReveal,
        ReplaceCommit,
        ReplaceReveal,
        Over,
        Void,
        Cancelled,
        OpenCards // Full only: the rules now need hidden cards opened (see Engine.openNeed); no commit, both sides just open
    }

    /// @dev opening of one hidden slot (Full)
    struct Opening {
        uint8 slot;
        uint256 cardId;
        bytes32 salt;
    }

    struct BoutData {
        address[2] player;
        uint256[2] pool;
        uint8 format;
        Phase phase;
        uint64 deadline;
        bytes32[2] commitHash;
        uint8[2] choice;
        bool[2] committed;
        bool[2] revealed;
        bool[2] needsReal; // replacement / open phase: which sides must actually act
        uint8[2] played; // bitmask of fighter slots that have been active (records)
        int8 winner; // -1 none, 0/1, 2 draw
        uint8 reason; // Engine.REASON_*
        bytes state; // packed engine state (176 bytes) once the bout has started
    }

    struct Hidden {
        bytes32[5][2] slotHash; // locked at the lead reveal
        uint256[5][2] card; // valid where the openMask bit is set
        uint8[2] poolMask; // pool positions already opened (a card may be used once)
        uint8[2] openMask; // slots opened so far
        uint8[2] need; // OpenCards phase: slots each side must still open
    }

    /// @dev one entrant waits per format; the next player to join is paired with them (first come, first served - no choosing)
    struct Waiting {
        address player;
        uint256 pool;
        uint64 expires;
    }

    mapping(uint8 => Waiting) public waiting;
    /// @notice true for bouts that came from the ranked queue (they rate both players and can move the Belt)
    mapping(uint256 => bool) public ranked;

    mapping(uint256 => BoutData) internal bouts;
    mapping(uint256 => Hidden) internal hid;
    uint256 public nextBout;

    /* ---------------- events (the indexer/UI feed; never depend on getLogs backfill) ---------------- */
    event ChallengeCreated(uint256 indexed boutId, address indexed creator, uint8 format, uint256 poolId, uint64 expires);
    event ChallengeAccepted(uint256 indexed boutId, address indexed opponent, uint256 poolId);
    event ChallengeCancelled(uint256 indexed boutId);
    event PhaseChanged(uint256 indexed boutId, Phase phase, uint64 deadline);
    event Committed(uint256 indexed boutId, uint8 side, Phase phase);
    event Revealed(uint256 indexed boutId, uint8 side, uint8 tag, uint8 choice);
    event BoutStarted(uint256 indexed boutId, bytes state);
    event TurnResolved(uint256 indexed boutId, uint8 turn, bytes state, bytes events);
    event ReplacementApplied(uint256 indexed boutId, bytes state, bytes events);
    event TurnConcluded(uint256 indexed boutId, bytes state, bytes events); // the rest of a turn, after an OpenCards pause
    event CardOpened(uint256 indexed boutId, uint8 side, uint8 slot, uint256 cardId);
    event BoutEnded(uint256 indexed boutId, int8 winner, uint8 reason, bytes state);
    event BoutVoided(uint256 indexed boutId);
    event RankedQueued(uint8 indexed format, address indexed player, uint256 poolId, uint64 expires);
    event RankedLeft(uint8 indexed format, address indexed player);
    event RankedMatched(uint256 indexed boutId, uint8 indexed format, address a, address b);

    error NotYourSeat();
    error BadPhase();
    error NotCreator();
    error NotExpired();
    error SelfPlay();
    error BadPool(string why);
    error FullDisabled();
    error NothingToDo();
    error OpeningRequired();
    error OpeningNotNeeded();
    error OpeningIncomplete();
    error BadOpening();

    constructor(Cards cards_, Armory armory_, Ladder ladder_, bool fullEnabled_) {
        cards = cards_;
        armory = armory_;
        ladder = ladder_;
        fullEnabled = fullEnabled_;
    }

    /* ---------------- commit hashes (clients compute exactly these) ---------------- */
    function commitHashOf(uint256 boutId, uint8 turn, uint8 tag, address player, uint8 choice, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), boutId, turn, tag, player, choice, salt));
    }

    /// @notice Full: the LEAD commit binds the lead slot AND all five blinded slot hashes.
    function fullLeadHashOf(uint256 boutId, address player, uint8 lead, bytes32[5] memory slotHashes, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode("SUBLEVEL.FULLLEAD", block.chainid, address(this), boutId, player, lead, keccak256(abi.encodePacked(slotHashes)), salt));
    }

    /// @notice Full: the blinded hash of one slot. Clients derive a distinct slotSalt per slot and reveal it only when opening that slot.
    function slotHashOf(uint256 boutId, uint8 side, uint8 slot, uint256 cardId, bytes32 slotSalt) public view returns (bytes32) {
        return keccak256(abi.encode("SUBLEVEL.SLOT", block.chainid, address(this), boutId, side, slot, cardId, slotSalt));
    }

    /* ---------------- challenge lifecycle (OWNER WALLET ONLY — no session keys) ---------------- */
    function createChallenge(uint8 format, uint256 poolId) external returns (uint256 boutId) {
        if (format == 1 && !fullEnabled) revert FullDisabled();
        _checkPool(poolId, msg.sender, format);
        boutId = nextBout++;
        BoutData storage b = bouts[boutId];
        b.player[0] = msg.sender;
        b.pool[0] = poolId;
        b.format = format;
        b.phase = Phase.Open;
        b.winner = -1;
        b.deadline = uint64(block.timestamp) + CHALLENGE_TTL;
        armory.setInBout(poolId, true);
        emit ChallengeCreated(boutId, msg.sender, format, poolId, b.deadline);
    }

    function acceptChallenge(uint256 boutId, uint256 poolId) external {
        BoutData storage b = bouts[boutId];
        if (b.phase != Phase.Open || block.timestamp > b.deadline) revert BadPhase();
        if (msg.sender == b.player[0]) revert SelfPlay();
        _checkPool(poolId, msg.sender, b.format);
        b.player[1] = msg.sender;
        b.pool[1] = poolId;
        armory.setInBout(poolId, true);
        emit ChallengeAccepted(boutId, msg.sender, poolId);
        _setPhase(boutId, b, Phase.LeadCommit);
    }

    function cancelChallenge(uint256 boutId) external {
        BoutData storage b = bouts[boutId];
        if (b.phase != Phase.Open) revert BadPhase();
        if (msg.sender != b.player[0]) revert NotCreator();
        _cancel(boutId, b);
    }

    /// @notice Anyone may clear an expired, unaccepted challenge (releases the creator's pool).
    function expireChallenge(uint256 boutId) external {
        BoutData storage b = bouts[boutId];
        if (b.phase != Phase.Open) revert BadPhase();
        if (block.timestamp <= b.deadline) revert NotExpired();
        _cancel(boutId, b);
    }

    /* ---------------- ranked queue (OWNER WALLET ONLY) ---------------- */
    /// @notice Enter the ranked queue with a registered, idle pool. If someone is already waiting in this format you are paired with
    ///         them at once (they take seat 0) and the bout starts; otherwise you wait (up to RANKED_TTL) for the next entrant.
    ///         There is no challenge to pick: the pairing is first come, first served.
    /// @return matched whether a bout was created; boutId is only meaningful when matched
    function joinRanked(uint8 format, uint256 poolId) external returns (bool matched, uint256 boutId) {
        if (format == 1 && !fullEnabled) revert FullDisabled();
        Waiting memory w = waiting[format];
        // sweep a stale entry FIRST: it may be the caller's own, still holding the very pool they are about to re-queue with
        if (w.player != address(0) && block.timestamp > w.expires) {
            _clearWaiting(format, w);
            w = Waiting(address(0), 0, 0);
        }
        _checkPool(poolId, msg.sender, format);
        if (w.player == address(0)) {
            uint64 exp = uint64(block.timestamp) + RANKED_TTL;
            waiting[format] = Waiting(msg.sender, poolId, exp);
            armory.setInBout(poolId, true);
            emit RankedQueued(format, msg.sender, poolId, exp);
            return (false, 0);
        }
        if (w.player == msg.sender) revert SelfPlay();
        boutId = nextBout++;
        BoutData storage b = bouts[boutId];
        b.player[0] = w.player;
        b.player[1] = msg.sender;
        b.pool[0] = w.pool; // already flagged in-bout when they queued
        b.pool[1] = poolId;
        b.format = format;
        b.winner = -1;
        ranked[boutId] = true;
        delete waiting[format];
        armory.setInBout(poolId, true);
        // same events as a normal challenge, so clients and indexers follow a ranked bout with the code they already have
        emit ChallengeCreated(boutId, w.player, format, w.pool, 0);
        emit ChallengeAccepted(boutId, msg.sender, poolId);
        emit RankedMatched(boutId, format, w.player, msg.sender);
        _setPhase(boutId, b, Phase.LeadCommit);
        return (true, boutId);
    }

    /// @notice Leave the queue before anyone joins. Releases your pool.
    function leaveRanked(uint8 format) external {
        Waiting memory w = waiting[format];
        if (w.player != msg.sender) revert NotCreator();
        _clearWaiting(format, w);
    }

    /// @notice Anyone may clear a waiting entrant whose time ran out (releases their pool).
    function expireRanked(uint8 format) external {
        Waiting memory w = waiting[format];
        if (w.player == address(0)) revert BadPhase();
        if (block.timestamp <= w.expires) revert NotExpired();
        _clearWaiting(format, w);
    }

    function _clearWaiting(uint8 format, Waiting memory w) private {
        delete waiting[format];
        armory.setInBout(w.pool, false);
        emit RankedLeft(format, w.player);
    }

    function _cancel(uint256 boutId, BoutData storage b) private {
        b.phase = Phase.Cancelled;
        armory.setInBout(b.pool[0], false);
        emit ChallengeCancelled(boutId);
    }

    function _checkPool(uint256 poolId, address who, uint8 format) private view {
        (address owner, uint8 fmt,, bool active, bool inBout) = armory.poolInfo(poolId);
        if (owner != who) revert BadPool("not your pool");
        if (!active) revert BadPool("inactive");
        if (inBout) revert BadPool("already in a bout");
        if (fmt != format) revert BadPool("wrong format");
    }

    /* ---------------- seats ---------------- */
    function _seat(BoutData storage b, uint8 side) private view {
        require(side < 2, "side");
        address p = b.player[side];
        if (msg.sender != p && !armory.isSession(p, msg.sender)) revert NotYourSeat();
    }

    function _tagOf(Phase ph) private pure returns (uint8) {
        if (ph == Phase.LeadCommit || ph == Phase.LeadReveal) return TAG_LEAD;
        if (ph == Phase.TurnCommit || ph == Phase.TurnReveal) return TAG_ACTION;
        return TAG_REPLACE;
    }

    function _turnOf(bytes storage st) private view returns (uint8) {
        return uint8(st[3]); // packed int16 #1 (turn), low byte
    }

    /// @dev which sides must act in the current phase
    function _required(BoutData storage b, Phase ph) private view returns (bool[2] memory r) {
        if (ph == Phase.ReplaceCommit || ph == Phase.ReplaceReveal || ph == Phase.OpenCards) return b.needsReal;
        r[0] = true;
        r[1] = true;
    }

    /// @dev commit/reveal flags are cleared only when a NEW window opens — moving Commit → Reveal must keep them
    function _setPhase(uint256 boutId, BoutData storage b, Phase ph) private {
        b.phase = ph;
        b.deadline = uint64(block.timestamp) + PHASE_TIMEOUT;
        if (ph == Phase.LeadCommit || ph == Phase.TurnCommit || ph == Phase.ReplaceCommit || ph == Phase.OpenCards) {
            b.committed = [false, false];
            b.revealed = [false, false];
        }
        emit PhaseChanged(boutId, ph, b.deadline);
    }

    /* ---------------- commit ---------------- */
    /// @notice Lock in your secret choice (lead slot / action / replacement slot) for the current phase. Session keys allowed.
    ///         Write-once per phase: nobody (including a session key) can overwrite a commit.
    function commit(uint256 boutId, uint8 side, bytes32 hash) external {
        BoutData storage b = bouts[boutId];
        _seat(b, side);
        Phase ph = b.phase;
        if (ph != Phase.LeadCommit && ph != Phase.TurnCommit && ph != Phase.ReplaceCommit) revert BadPhase();
        if (block.timestamp > b.deadline) revert BadPhase(); // too late: anyone can claimTimeout
        bool[2] memory req = _required(b, ph);
        require(req[side] && !b.committed[side], "cannot commit");
        b.commitHash[side] = hash;
        b.committed[side] = true;
        emit Committed(boutId, side, ph);
        if ((!req[0] || b.committed[0]) && (!req[1] || b.committed[1])) {
            _setPhase(boutId, b, Phase(uint8(ph) + 1)); // Commit → Reveal
        }
    }

    /* ---------------- reveal ---------------- */
    /// @notice Lite lead, or any action / replacement that needs no hidden card opened. Session keys allowed.
    function reveal(uint256 boutId, uint8 side, uint8 choice, bytes32 salt) external {
        _reveal(boutId, side, choice, salt, false, Opening(0, 0, 0));
    }

    /// @notice Full: reveal + open the one hidden card this choice brings into play (SWITCH → fighter slot, TRICK → trick slot,
    ///         replacement → fighter slot), in the same transaction.
    function revealOpen(uint256 boutId, uint8 side, uint8 choice, bytes32 salt, Opening calldata open) external {
        _reveal(boutId, side, choice, salt, true, open);
    }

    /// @notice Full lead reveal: reveals the lead slot, publishes the five blinded slot hashes and opens the lead fighter.
    function revealLead(uint256 boutId, uint8 side, uint8 lead, bytes32[5] calldata slotHashes, bytes32 salt, Opening calldata open) external {
        BoutData storage b = bouts[boutId];
        _seat(b, side);
        if (b.format != 1 || b.phase != Phase.LeadReveal) revert BadPhase();
        if (block.timestamp > b.deadline) revert BadPhase();
        require(b.committed[side] && !b.revealed[side], "nothing to reveal");
        if (fullLeadHashOf(boutId, b.player[side], lead, slotHashes, salt) != b.commitHash[side]) return _forfeit(boutId, b, side);
        if (lead >= FIGHTER_SLOTS || open.slot != lead) return _forfeit(boutId, b, side);
        hid[boutId].slotHash[side] = slotHashes;
        (bool ok,) = _checkOpen(boutId, b, side, open);
        if (!ok) return _forfeit(boutId, b, side);
        b.choice[side] = lead;
        b.revealed[side] = true;
        emit Revealed(boutId, side, TAG_LEAD, lead);
        _maybeAdvance(boutId, b, Phase.LeadReveal);
    }

    function _forfeit(uint256 boutId, BoutData storage b, uint8 side) private {
        _finish(boutId, b, side == 0 ? int8(1) : int8(0), Engine.REASON_FORFEIT);
    }

    function _reveal(uint256 boutId, uint8 side, uint8 choice, bytes32 salt, bool hasOpen, Opening memory open) private {
        BoutData storage b = bouts[boutId];
        _seat(b, side);
        Phase ph = b.phase;
        if (ph != Phase.LeadReveal && ph != Phase.TurnReveal && ph != Phase.ReplaceReveal) revert BadPhase();
        if (ph == Phase.LeadReveal && b.format != 0) revert BadPhase(); // Full leads go through revealLead
        if (block.timestamp > b.deadline) revert BadPhase();
        require(b.committed[side] && !b.revealed[side], "nothing to reveal");

        uint8 tag = _tagOf(ph);
        uint8 turn = ph == Phase.LeadReveal ? 0 : _turnOf(b.state);
        if (commitHashOf(boutId, turn, tag, b.player[side], choice, salt) != b.commitHash[side]) return _forfeit(boutId, b, side); // mismatch

        if (ph == Phase.LeadReveal) {
            if (hasOpen) revert OpeningNotNeeded();
            if (choice >= R.format(b.format).fighters) return _forfeit(boutId, b, side); // illegal lead
        } else if (!_checkChoice(boutId, b, ph, side, choice, hasOpen, open)) {
            return _forfeit(boutId, b, side); // illegal choice, or a bad opening
        }
        b.choice[side] = choice;
        b.revealed[side] = true;
        emit Revealed(boutId, side, tag, choice);
        _maybeAdvance(boutId, b, ph);
    }

    /// @dev legality of an action / replacement and, for Full, the opening it needs. false = forfeit; reverts if the caller used
    ///      the wrong entry point (missing / superfluous opening) — nothing is lost, they can simply call again.
    function _checkChoice(uint256 boutId, BoutData storage b, Phase ph, uint8 side, uint8 choice, bool hasOpen, Opening memory open) private returns (bool) {
        Engine.Bout memory bt = _load(b);
        if (!(ph == Phase.TurnReveal ? Engine.isLegal(bt, side, choice) : Engine.isLegalReplacement(bt, side, choice))) return false;
        (bool need, uint8 slot) = b.format == 1 ? _openingNeeded(bt, ph, side, choice) : (false, 0);
        if (!need) {
            if (hasOpen) revert OpeningNotNeeded();
            return true;
        }
        if (!hasOpen) revert OpeningRequired();
        if (open.slot != slot) return false; // opened the wrong slot
        (bool ok, Cards.Card memory c) = _checkOpen(boutId, b, side, open);
        if (!ok) return false;
        _apply(bt, side, open.slot, c);
        b.state = BoutCodec.pack(bt);
        return true;
    }

    function _maybeAdvance(uint256 boutId, BoutData storage b, Phase ph) private {
        bool[2] memory req = _required(b, ph);
        if ((!req[0] || b.revealed[0]) && (!req[1] || b.revealed[1])) {
            if (ph == Phase.LeadReveal) _startBout(boutId, b);
            else if (ph == Phase.TurnReveal) _resolve(boutId, b);
            else if (ph == Phase.ReplaceReveal) _replace(boutId, b);
            else _resume(boutId, b);
        }
    }

    function _load(BoutData storage b) private view returns (Engine.Bout memory bt) {
        bt = BoutCodec.unpack(b.state);
        bt.lazy = bt.fmt.hidden; // hidden-loadout bouts keep placeholders for unopened cards
    }

    /* ---------------- hidden cards (Full) ---------------- */
    /// @dev which hidden slot (if any) must be opened for this choice
    function _openingNeeded(Engine.Bout memory bt, Phase ph, uint8 side, uint8 choice) private pure returns (bool need, uint8 slot) {
        Engine.Side memory sd = bt.s[side];
        if (ph == Phase.ReplaceReveal) return (sd.f[choice].maxHp == 0, choice);
        if (Engine.isSwitch(choice)) {
            slot = choice - Engine.SWITCH0;
            return (sd.f[slot].maxHp == 0, slot);
        }
        if (Engine.isTrick(choice)) {
            uint8 j = choice - Engine.TRICK0;
            return (sd.t[j].id == Engine.UNOPENED_TRICK, FIGHTER_SLOTS + j);
        }
        return (false, 0);
    }

    /// @dev validates one opening against the locked slot hash, the pool, the slot's kind and one-use-per-card; on success it
    ///      records the opening and returns the card. `false` = the opener cheated or erred.
    function _checkOpen(uint256 boutId, BoutData storage b, uint8 side, Opening memory o) private returns (bool, Cards.Card memory c) {
        if (o.slot >= SLOTS) return (false, c);
        Hidden storage h = hid[boutId];
        if ((h.openMask[side] >> o.slot) & 1 == 1) return (false, c); // slot already opened
        if (slotHashOf(boutId, side, o.slot, o.cardId, o.salt) != h.slotHash[side][o.slot]) return (false, c); // not what was locked
        uint256[] memory ids = armory.poolIds(b.pool[side]);
        uint256 idx = type(uint256).max;
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == o.cardId) {
                idx = i;
                break;
            }
        }
        if (idx == type(uint256).max) return (false, c); // not in the locked pool
        if ((h.poolMask[side] >> idx) & 1 == 1) return (false, c); // the same card in two slots
        c = cards.cardData(o.cardId);
        if ((c.kind == cards.KIND_FIGHTER()) != (o.slot < FIGHTER_SLOTS)) return (false, c); // wrong kind for the slot
        h.poolMask[side] |= uint8(1) << uint8(idx);
        h.openMask[side] |= uint8(1) << o.slot;
        h.card[side][o.slot] = o.cardId;
        emit CardOpened(boutId, side, o.slot, o.cardId);
        return (true, c);
    }

    /// @dev write an opened card's numbers into the (lazy) engine state
    function _apply(Engine.Bout memory bt, uint8 side, uint8 slot, Cards.Card memory c) private pure {
        if (slot < FIGHTER_SLOTS) Engine.openFighter(bt, side, slot, c.style, c.atk0, c.atk1, c.spread);
        else Engine.openTrick(bt, side, slot - FIGHTER_SLOTS, c.trickId);
    }

    /// @notice Full, OpenCards phase: open exactly the slots the rules need (see `getHidden().need`). Session keys allowed.
    function openCards(uint256 boutId, uint8 side, Opening[] calldata ops) external {
        BoutData storage b = bouts[boutId];
        _seat(b, side);
        if (b.phase != Phase.OpenCards) revert BadPhase();
        if (block.timestamp > b.deadline) revert BadPhase();
        require(b.needsReal[side] && !b.revealed[side], "nothing to open");
        uint8 need = hid[boutId].need[side];
        Engine.Bout memory bt = _load(b);
        uint8 got;
        for (uint256 i = 0; i < ops.length; i++) {
            Opening memory o = ops[i];
            if (o.slot >= SLOTS || (need >> o.slot) & 1 == 0 || (got >> o.slot) & 1 == 1) return _forfeit(boutId, b, side); // not asked for / twice
            got |= uint8(1) << o.slot;
            (bool ok, Cards.Card memory c) = _checkOpen(boutId, b, side, o);
            if (!ok) return _forfeit(boutId, b, side);
            _apply(bt, side, o.slot, c);
        }
        if (got != need) revert OpeningIncomplete();
        b.state = BoutCodec.pack(bt);
        b.revealed[side] = true;
        _maybeAdvance(boutId, b, Phase.OpenCards);
    }

    /// @notice Full, after the bout: anyone seated may publish the rest of their hand (cosmetic — it changes no result or record).
    ///         The stored state then equals the full-information state.
    function openAfter(uint256 boutId, uint8 side, Opening[] calldata ops) external {
        BoutData storage b = bouts[boutId];
        _seat(b, side);
        if (b.phase != Phase.Over || b.format != 1 || b.state.length != BoutCodec.STATE_BYTES || hid[boutId].slotHash[side][0] == bytes32(0)) revert BadPhase();
        Engine.Bout memory bt = _load(b);
        for (uint256 i = 0; i < ops.length; i++) {
            (bool ok, Cards.Card memory c) = _checkOpen(boutId, b, side, ops[i]);
            if (!ok) revert BadOpening();
            _apply(bt, side, ops[i].slot, c);
        }
        b.state = BoutCodec.pack(bt);
    }

    /* ---------------- bout flow ---------------- */
    /// @dev Lite: the whole 3-card pool is the loadout (fighters then trick, in pool order). All public.
    function _loadout(uint256 poolId, uint8 lead, uint8 format) private view returns (Engine.Loadout memory l) {
        R.Format memory f = R.format(format);
        uint256[] memory ids = armory.poolIds(poolId);
        for (uint256 i = 0; i < ids.length; i++) {
            Cards.Card memory c = cards.cardData(ids[i]);
            if (c.kind == cards.KIND_FIGHTER()) {
                if (l.nF == f.fighters) continue;
                l.style[l.nF] = c.style;
                l.atk0[l.nF] = c.atk0;
                l.atk1[l.nF] = c.atk1;
                l.spread[l.nF] = c.spread;
                l.nF++;
            } else {
                if (l.nT == f.tricks) continue;
                l.tricks[l.nT++] = c.trickId;
            }
        }
        l.lead = lead;
    }

    /// @dev Full: only the lead fighter is known; every other slot is a placeholder until opened.
    function _fullLoadout(uint256 boutId, uint8 side, uint8 lead) private view returns (Engine.Loadout memory l) {
        Cards.Card memory c = cards.cardData(hid[boutId].card[side][lead]);
        l.nF = FIGHTER_SLOTS;
        l.nT = SLOTS - FIGHTER_SLOTS;
        l.lead = lead;
        l.unknown = uint8(0x1F) & ~(uint8(1) << lead);
        l.style[lead] = c.style;
        l.atk0[lead] = c.atk0;
        l.atk1[lead] = c.atk1;
        l.spread[lead] = c.spread;
    }

    function _startBout(uint256 boutId, BoutData storage b) private {
        Engine.Bout memory bt;
        if (b.format == 1) bt = Engine.create(1, _fullLoadout(boutId, 0, b.choice[0]), _fullLoadout(boutId, 1, b.choice[1]));
        else bt = Engine.create(b.format, _loadout(b.pool[0], b.choice[0], b.format), _loadout(b.pool[1], b.choice[1], b.format));
        b.played = [uint8(1) << bt.s[0].active, uint8(1) << bt.s[1].active];
        b.state = BoutCodec.pack(bt);
        emit BoutStarted(boutId, b.state);
        _setPhase(boutId, b, Phase.TurnCommit);
    }

    function _resolve(uint256 boutId, BoutData storage b) private {
        Engine.Bout memory bt = _load(b);
        Engine.Ev[] memory ev = Engine.resolveTurn(bt, b.choice[0], b.choice[1]);
        _afterEngine(boutId, b, bt, ev, 0);
    }

    function _replace(uint256 boutId, BoutData storage b) private {
        Engine.Bout memory bt = _load(b);
        uint8 c0 = b.needsReal[0] ? b.choice[0] : _forced(bt, 0);
        uint8 c1 = b.needsReal[1] ? b.choice[1] : _forced(bt, 1);
        Engine.Ev[] memory ev = Engine.applyReplacements(bt, c0, c1);
        _afterEngine(boutId, b, bt, ev, 1);
    }

    function _resume(uint256 boutId, BoutData storage b) private {
        Engine.Bout memory bt = _load(b);
        Engine.Ev[] memory ev = Engine.finish(bt);
        _afterEngine(boutId, b, bt, ev, 2);
    }

    function _forced(Engine.Bout memory bt, uint8 s) private pure returns (uint8) {
        for (uint8 i = 0; i < bt.s[s].nF; i++) if (bt.s[s].f[i].alive) return i;
        return 0;
    }

    function _aliveCount(Engine.Side memory sd) private pure returns (uint8 n) {
        for (uint8 i = 0; i < sd.nF; i++) if (sd.f[i].alive) n++;
    }

    /// @param kind 0 = a turn just resolved, 1 = replacements applied, 2 = a turn finished after an OpenCards pause
    function _afterEngine(uint256 boutId, BoutData storage b, Engine.Bout memory bt, Engine.Ev[] memory ev, uint8 kind) private {
        for (uint8 s = 0; s < 2; s++) b.played[s] |= uint8(1) << bt.s[s].active;
        b.state = BoutCodec.pack(bt);
        if (kind == 0) emit TurnResolved(boutId, bt.turn, b.state, BoutCodec.packEvents(ev));
        else if (kind == 1) emit ReplacementApplied(boutId, b.state, BoutCodec.packEvents(ev));
        else emit TurnConcluded(boutId, b.state, BoutCodec.packEvents(ev));

        if (bt.phase == Engine.PHASE_OVER) return _finish(boutId, b, bt.winner, bt.reason);

        if (bt.phase == Engine.PHASE_OPEN) {
            (uint8 m0, uint8 m1) = Engine.openNeed(bt);
            hid[boutId].need = [m0, m1];
            b.needsReal = [m0 != 0, m1 != 0];
            return _setPhase(boutId, b, Phase.OpenCards);
        }

        if (bt.phase == Engine.PHASE_REPLACE) {
            (bool n0, bool n1) = Engine.needsReplacement(bt);
            // Full: even a forced replacement is a real step — the player must open that (still hidden) fighter
            bool real0 = n0 && (bt.lazy || _aliveCount(bt.s[0]) > 1);
            bool real1 = n1 && (bt.lazy || _aliveCount(bt.s[1]) > 1);
            if (real0 || real1) {
                b.needsReal = [real0, real1]; // the other side's single option is applied automatically
                return _setPhase(boutId, b, Phase.ReplaceCommit);
            }
            // nothing to decide: apply the forced replacements now
            Engine.Ev[] memory ev2 = Engine.applyReplacements(bt, _forced(bt, 0), _forced(bt, 1));
            return _afterEngine(boutId, b, bt, ev2, 1);
        }
        _setPhase(boutId, b, Phase.TurnCommit);
    }

    /* ---------------- timeouts ---------------- */
    /// @notice Anyone can call once a phase deadline has passed. The side that failed to act forfeits; both missing voids the bout.
    function claimTimeout(uint256 boutId) external {
        BoutData storage b = bouts[boutId];
        Phase ph = b.phase;
        if ((ph < Phase.LeadCommit || ph > Phase.ReplaceReveal) && ph != Phase.OpenCards) revert BadPhase();
        if (block.timestamp <= b.deadline) revert NotExpired();
        bool commitPhase = ph == Phase.LeadCommit || ph == Phase.TurnCommit || ph == Phase.ReplaceCommit;
        bool[2] memory req = _required(b, ph);
        bool m0 = req[0] && (commitPhase ? !b.committed[0] : !b.revealed[0]);
        bool m1 = req[1] && (commitPhase ? !b.committed[1] : !b.revealed[1]);
        if (m0 && m1) return _void(boutId, b);
        if (m0) return _finish(boutId, b, 1, Engine.REASON_FORFEIT);
        if (m1) return _finish(boutId, b, 0, Engine.REASON_FORFEIT);
        revert NothingToDo();
    }

    function _void(uint256 boutId, BoutData storage b) private {
        b.phase = Phase.Void;
        _releasePools(b);
        emit BoutVoided(boutId);
    }

    function _releasePools(BoutData storage b) private {
        armory.setInBout(b.pool[0], false);
        if (b.player[1] != address(0)) armory.setInBout(b.pool[1], false);
    }

    /* ---------------- settlement ---------------- */
    function _finish(uint256 boutId, BoutData storage b, int8 winner, uint8 reason) private {
        b.phase = Phase.Over;
        b.winner = winner;
        b.reason = reason;
        _releasePools(b);
        if (b.state.length == BoutCodec.STATE_BYTES) _record(boutId, b, winner);
        // a ranked result (a forfeit included: walking away from a ranked bout costs rating) rates both players and may move the Belt
        if (ranked[boutId]) ladder.settle(b.format, b.player[0], b.player[1], winner, boutId);
        emit BoutEnded(boutId, winner, reason, b.state);
    }

    /// @dev every fighter that actually entered play (and every trick that was used) gets the career entry.
    ///      Anything that entered play has been opened, so its card id is known.
    function _record(uint256 boutId, BoutData storage b, int8 winner) private {
        Engine.Bout memory bt = BoutCodec.unpack(b.state);
        for (uint8 s = 0; s < 2; s++) {
            uint8 outcome = winner == 2 ? 2 : (int8(uint8(s)) == winner ? 1 : 0);
            if (b.format == 1) {
                Hidden storage h = hid[boutId];
                for (uint8 i = 0; i < bt.s[s].nF; i++) {
                    if ((b.played[s] >> i) & 1 == 1) cards.recordBout(h.card[s][i], outcome, !bt.s[s].f[i].alive);
                }
                for (uint8 j = 0; j < bt.s[s].nT; j++) {
                    if (bt.s[s].t[j].used) cards.recordBout(h.card[s][FIGHTER_SLOTS + j], outcome, false);
                }
                continue;
            }
            uint256[] memory ids = armory.poolIds(b.pool[s]);
            uint8 fi;
            uint8 ti;
            for (uint256 i = 0; i < ids.length; i++) {
                if (cards.cardData(ids[i]).kind == cards.KIND_FIGHTER()) {
                    if (fi < bt.s[s].nF) {
                        if ((b.played[s] >> fi) & 1 == 1) cards.recordBout(ids[i], outcome, !bt.s[s].f[fi].alive);
                        fi++;
                    }
                } else if (ti < bt.s[s].nT) {
                    if (bt.s[s].t[ti].used) cards.recordBout(ids[i], outcome, false);
                    ti++;
                }
            }
        }
    }

    /* ---------------- views ---------------- */
    function getBout(uint256 boutId)
        external
        view
        returns (address[2] memory player, uint256[2] memory pool, uint8 format, Phase phase, uint64 deadline, bool[2] memory committed, bool[2] memory revealed, bool[2] memory needsReal, int8 winner, uint8 reason)
    {
        BoutData storage b = bouts[boutId];
        return (b.player, b.pool, b.format, b.phase, b.deadline, b.committed, b.revealed, b.needsReal, b.winner, b.reason);
    }

    /// @notice packed 176-byte engine state (empty before the lead reveal). Decode with BoutCodec's layout (see encode.ts).
    ///         In Full, unopened cards are placeholders (fighter maxHp 0 / trick id 255) until opened.
    function getState(uint256 boutId) external view returns (bytes memory) {
        return bouts[boutId].state;
    }

    /// @notice Full: the locked slot hashes, which slots are opened (and as what), and — in the OpenCards phase — what each side still owes.
    function getHidden(uint256 boutId) external view returns (bytes32[5][2] memory slotHash, uint256[5][2] memory card, uint8[2] memory openMask, uint8[2] memory need) {
        Hidden storage h = hid[boutId];
        return (h.slotHash, h.card, h.openMask, h.need);
    }
}
