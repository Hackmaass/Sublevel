// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RulebookV1 as R} from "./RulebookV1.sol";

/// @title Engine — the deterministic duel rules, Rulebook v1.
/// @notice A line-by-line port of `packages/engine/src/engine.ts`. Pure: no randomness, no time, no storage.
///         Verified against ~1,100 cross-language vectors (`test/EngineVectors.t.sol`).
///         v1 behaviour is HARD-WIRED: guard triangle (Brace blocks LIGHT, HEAVY breaks it for ⅔, LIGHT interrupts HEAVY)
///         and a free Switch when the opponent doesn't attack.
library Engine {
    /* ---------------- action ids ---------------- */
    uint8 internal constant ATTACK1 = 0;
    uint8 internal constant ATTACK2 = 1;
    uint8 internal constant BRACE = 2;
    uint8 internal constant SWITCH0 = 3; // 3..5
    uint8 internal constant TRICK0 = 6; // 6..7

    uint8 internal constant PHASE_TURN = 0;
    uint8 internal constant PHASE_REPLACE = 1;
    uint8 internal constant PHASE_OVER = 2;
    uint8 internal constant PHASE_OPEN = 3; // LAZY (hidden-loadout) bouts only: paused until the named hidden cards are opened
    uint8 internal constant UNOPENED_TRICK = 255;

    uint8 internal constant REASON_KO = 0;
    uint8 internal constant REASON_DECISION = 1;
    uint8 internal constant REASON_DRAW = 2;
    uint8 internal constant REASON_FORFEIT = 3;

    /* ---------------- state ---------------- */
    struct Fighter {
        uint8 style;
        uint8 atk0;
        uint8 atk1;
        uint8 spread;
        int16 maxHp;
        int16 hp;
        uint8 retreat;
        bool revealed;
        bool alive;
    }

    struct Trick {
        uint8 id;
        bool used;
        bool revealed;
    }

    struct Side {
        Fighter[3] f;
        Trick[2] t;
        uint8 nF;
        uint8 nT;
        uint8 active;
        uint8 grit;
        uint8 braceStreak;
        uint8 kos;
        uint16 dealt;
        int16 last; // last action, -1 none
    }

    struct Bout {
        R.Format fmt;
        uint8 turn;
        uint8 phase;
        bool sudden;
        int8 winner; // -1 none, 0/1 side, 2 draw
        uint8 reason;
        Side[2] s;
        /// @dev not part of the packed state. true = hidden-loadout bout: unopened slots are placeholders (maxHp 0 / trick id 255)
        bool lazy;
    }

    /// @dev event record: [t, side, a, b, c, d] — see packages/engine/src/encode.ts
    struct Ev {
        int16 t;
        int16 side;
        int16 a;
        int16 b;
        int16 c;
        int16 d;
    }

    /// @dev what a player brings (ids only; numbers come from the Rulebook)
    struct Loadout {
        uint8[3] style;
        uint8[3] atk0;
        uint8[3] atk1;
        uint8[3] spread;
        uint8 nF;
        uint8[2] tricks;
        uint8 nT;
        uint8 lead;
        /// @dev lazy bouts: bit i (0..2) = fighter i, bit 3+j = trick j is NOT known yet. 0 = everything known.
        uint8 unknown;
    }

    /* ---------------- integer helpers ---------------- */
    function _clamp(int256 g) private pure returns (uint8) {
        if (g <= 0) return 0;
        if (g >= int256(uint256(R.GRIT_CAP))) return R.GRIT_CAP;
        return uint8(uint256(g));
    }

    function _ceilHalf(uint256 x) private pure returns (uint256) {
        return (x + 1) >> 1;
    }

    function _adv(uint256 x) private pure returns (uint256) {
        return (x * 3 + 1) >> 1;
    }

    function _dis(uint256 x) private pure returns (uint256) {
        uint256 v = (x * 2) / 3;
        return v < 1 ? 1 : v;
    }

    function _advantage(uint8 att, uint8 def) private pure returns (int8) {
        if (att == def) return 0;
        return (att + 1) % 3 == def ? int8(1) : int8(-1);
    }

    function _min(int256 a, int256 b) private pure returns (int256) {
        return a < b ? a : b;
    }

    function _max0(int256 a) private pure returns (int256) {
        return a < 0 ? int256(0) : a;
    }

    function isAttack(uint8 a) internal pure returns (bool) {
        return a <= 1;
    }

    function isSwitch(uint8 a) internal pure returns (bool) {
        return a >= SWITCH0 && a <= 5;
    }

    function isTrick(uint8 a) internal pure returns (bool) {
        return a == 6 || a == 7;
    }

    function _atkId(Fighter memory f, uint8 idx) private pure returns (uint8) {
        return idx == 0 ? f.atk0 : f.atk1;
    }

    /* ---------------- creation ---------------- */
    function create(uint8 fmtId, Loadout memory a, Loadout memory b) internal pure returns (Bout memory out) {
        out.fmt = R.format(fmtId);
        out.winner = -1;
        _makeSide(out, 0, a);
        _makeSide(out, 1, b);
        out.lazy = (a.unknown | b.unknown) != 0;
    }

    function _makeSide(Bout memory out, uint8 idx, Loadout memory l) private pure {
        R.Format memory f = out.fmt;
        require(l.nF == f.fighters && l.nT == f.tricks, "loadout size");
        require(l.lead < l.nF, "lead");
        Side memory s = out.s[idx];
        s.nF = l.nF;
        s.nT = l.nT;
        s.active = l.lead;
        s.grit = f.startGrit;
        s.last = -1;
        for (uint8 i = 0; i < l.nF; i++) {
            if ((l.unknown >> i) & 1 == 1) {
                s.f[i].alive = true; // placeholder: stats stay zero until the card is opened
                continue;
            }
            require(R.isLegalBuild(l.style[i], l.atk0[i], l.atk1[i], l.spread[i]), "illegal build");
            (uint8 hp, uint8 retreat) = R.spread(l.spread[i]);
            uint256 scaled = (uint256(hp) * f.hpPct) / 100;
            if (scaled < 1) scaled = 1;
            s.f[i] = Fighter(l.style[i], l.atk0[i], l.atk1[i], l.spread[i], int16(uint16(scaled)), int16(uint16(scaled)), retreat, !f.hidden || i == l.lead, true);
        }
        for (uint8 j = 0; j < l.nT; j++) {
            if ((l.unknown >> (3 + j)) & 1 == 1) {
                s.t[j] = Trick(UNOPENED_TRICK, false, false);
                continue;
            }
            require(l.tricks[j] < R.TRICK_COUNT, "trick id");
            s.t[j] = Trick(l.tricks[j], false, !f.hidden);
        }
    }

    /* ---------------- legality ---------------- */
    function isLegal(Bout memory b, uint8 side, uint8 a) internal pure returns (bool) {
        if (b.phase != PHASE_TURN) return false;
        Side memory s = b.s[side];
        Fighter memory act = s.f[s.active];
        if (a <= 1) {
            (, uint8 cost,,) = R.attack(_atkId(act, a));
            return s.grit >= cost;
        }
        if (a == BRACE) return true;
        if (isSwitch(a)) {
            uint8 slot = a - SWITCH0;
            return slot < s.nF && slot != s.active && s.f[slot].alive && s.grit >= act.retreat;
        }
        if (isTrick(a)) {
            uint8 j = a - TRICK0;
            return j < s.nT && !s.t[j].used && s.grit >= R.TRICK_COST;
        }
        return false;
    }

    /// @dev same order as the TS engine: attack1, attack2, brace, switches (slot asc), tricks (asc)
    function legalActions(Bout memory b, uint8 side) internal pure returns (uint8[] memory out) {
        uint8[] memory tmp = new uint8[](8);
        uint256 n;
        for (uint8 a = 0; a < 8; a++) {
            if (isLegal(b, side, a)) tmp[n++] = a;
        }
        out = new uint8[](n);
        for (uint256 i = 0; i < n; i++) out[i] = tmp[i];
    }

    /* ---------------- turn resolution ---------------- */
    struct Ctx {
        Ev[] ev;
        uint256 n;
        uint8[2] acts;
        bool[2] smoke;
        bool[2] sucker;
        int16[2] trickId;
        int256[2] swIdx;
        bool[2] koed;
    }

    function _push(Ctx memory c, int16 t, int16 side, int16 a, int16 b, int16 cc, int16 d) private pure {
        c.ev[c.n++] = Ev(t, side, a, b, cc, d);
    }

    /// @notice Resolve one turn in place. Returns the events (trimmed). Reverts on illegal actions.
    function resolveTurn(Bout memory b, uint8 actA, uint8 actB) internal pure returns (Ev[] memory) {
        require(b.phase == PHASE_TURN, "phase");
        require(isLegal(b, 0, actA), "illegal A");
        require(isLegal(b, 1, actB), "illegal B");

        Ctx memory c;
        c.ev = new Ev[](32);
        c.acts = [actA, actB];
        c.trickId = [int16(-1), int16(-1)];
        c.swIdx = [int256(-1), int256(-1)];
        b.turn += 1;

        _payCosts(b, c);
        _switches(b, c);
        _tricks(b, c);
        _attacks(b, c);
        _brace(b, c);
        _refunds(b, c);
        _kos(b, c);
        for (uint8 s = 0; s < 2; s++) b.s[s].grit = _clamp(int256(uint256(b.s[s].grit)) + 1);
        _finishTurn(b, c);

        Ev[] memory ev = c.ev;
        uint256 n = c.n;
        assembly {
            mstore(ev, n)
        }
        return ev;
    }

    function _payCosts(Bout memory b, Ctx memory c) private pure {
        for (uint8 s = 0; s < 2; s++) {
            Side memory sd = b.s[s];
            Fighter memory act = sd.f[sd.active];
            uint8 a = c.acts[s];
            if (isAttack(a)) {
                (, uint8 cost,,) = R.attack(_atkId(act, a));
                sd.grit -= cost;
            } else if (isSwitch(a)) {
                sd.grit -= act.retreat;
            } else if (isTrick(a)) {
                sd.grit -= R.TRICK_COST;
            }
        }
    }

    function _switches(Bout memory b, Ctx memory c) private pure {
        for (uint8 s = 0; s < 2; s++) {
            uint8 a = c.acts[s];
            if (!isSwitch(a)) continue;
            Side memory sd = b.s[s];
            uint8 from = sd.active;
            uint8 to = a - SWITCH0;
            require(!b.lazy || sd.f[to].maxHp > 0, "unopened");
            uint8 cost = sd.f[from].retreat;
            sd.active = to;
            sd.f[to].revealed = true;
            c.swIdx[s] = int256(c.n);
            _push(c, 0, int16(uint16(s)), int16(uint16(from)), int16(uint16(to)), int16(uint16(cost)), 0);
        }
    }

    function _tricks(Bout memory b, Ctx memory c) private pure {
        for (uint8 s = 0; s < 2; s++) {
            uint8 a = c.acts[s];
            if (!isTrick(a)) continue;
            Trick memory tk = b.s[s].t[a - TRICK0];
            require(tk.id != UNOPENED_TRICK, "unopened");
            tk.used = true;
            tk.revealed = true;
            c.trickId[s] = int16(uint16(tk.id));
        }
        // pass A: heals, Grit gain, flags
        for (uint8 s = 0; s < 2; s++) {
            int16 id = c.trickId[s];
            if (id < 0) continue;
            Side memory sd = b.s[s];
            Fighter memory f = sd.f[sd.active];
            if (id == 1) {
                int256 missing = int256(f.maxHp) - int256(f.hp);
                int256 healed = _min(3, missing);
                f.hp += int16(healed);
                _push(c, 1, int16(uint16(s)), id, -1, int16(healed), 0);
            } else if (id == 2) {
                uint8 before = sd.grit;
                sd.grit = _clamp(int256(uint256(sd.grit)) + 2);
                _push(c, 1, int16(uint16(s)), id, -1, int16(uint16(sd.grit - before)), 0);
            } else if (id == 3) {
                c.smoke[s] = true;
                _push(c, 1, int16(uint16(s)), id, -1, -1, 0);
            } else if (id == 4) {
                c.sucker[s] = true;
            }
        }
        // pass B: damage / denial
        for (uint8 s = 0; s < 2; s++) {
            int16 id = c.trickId[s];
            if (id < 0) continue;
            uint8 o = 1 - s;
            Side memory opp = b.s[o];
            Fighter memory tgt = opp.f[opp.active];
            if (id == 0) {
                int256 d = _min(2, _max0(int256(tgt.hp)));
                tgt.hp -= 2;
                b.s[s].dealt += uint16(uint256(d));
                _push(c, 1, int16(uint16(s)), id, int16(uint16(o)), 2, 0);
            } else if (id == 5) {
                uint8 before = opp.grit;
                opp.grit = _clamp(int256(uint256(opp.grit)) - 2);
                _push(c, 1, int16(uint16(s)), id, int16(uint16(o)), int16(uint16(before - opp.grit)), 0);
            } else if (id == 4) {
                if (isAttack(c.acts[o])) {
                    int256 d = _min(3, _max0(int256(tgt.hp)));
                    tgt.hp -= 3;
                    b.s[s].dealt += uint16(uint256(d));
                    _push(c, 1, int16(uint16(s)), id, int16(uint16(o)), 3, 0);
                } else {
                    _push(c, 1, int16(uint16(s)), id, -1, 0, 0);
                }
            }
        }
    }

    struct Hit {
        bool has;
        uint256 dmg;
        int16 attackId;
        int16 target;
        int16 flags;
    }

    function _attacks(Bout memory b, Ctx memory c) private pure {
        Hit[2] memory hits;
        for (uint8 s = 0; s < 2; s++) {
            if (!isAttack(c.acts[s])) continue;
            hits[s] = _computeHit(b, c, s);
        }
        for (uint8 s = 0; s < 2; s++) {
            if (!hits[s].has) continue;
            Side memory od = b.s[1 - s];
            Fighter memory def = od.f[od.active];
            int256 applied = _min(int256(hits[s].dmg), _max0(int256(def.hp)));
            def.hp -= int16(uint16(hits[s].dmg));
            b.s[s].dealt += uint16(uint256(applied));
            _push(c, 2, int16(uint16(s)), hits[s].attackId, int16(uint16(hits[s].dmg)), hits[s].target, hits[s].flags);
        }
    }

    /// @dev working values for one attack (a struct keeps the stack shallow)
    struct Calc {
        uint8 aid;
        uint8 cost;
        uint8 tag;
        int8 rel;
        uint256 d;
        bool braced;
        bool smoked;
        bool countered;
        bool nullified;
        bool blocked;
        bool guardBroken;
        bool interrupted;
    }

    function _computeHit(Bout memory b, Ctx memory c, uint8 s) private pure returns (Hit memory h) {
        Fighter memory att = b.s[s].f[b.s[s].active];
        Fighter memory def = b.s[1 - s].f[b.s[1 - s].active];
        if (att.hp <= 0 || def.hp <= 0) return h; // has = false

        Calc memory k;
        k.aid = _atkId(att, c.acts[s]);
        uint8 base;
        (, k.cost, base, k.tag) = R.attack(k.aid);
        k.rel = _advantage(att.style, def.style);
        k.d = base;
        if (k.rel > 0) k.d = _adv(k.d);
        else if (k.rel < 0 && k.tag != R.TAG_PIERCE) k.d = _dis(k.d);
        k.countered = k.tag == R.TAG_COUNTER && isSwitch(c.acts[1 - s]);
        if (k.countered) k.d += 2;
        k.braced = c.acts[1 - s] == BRACE && k.tag != R.TAG_GRAPPLE;
        k.smoked = c.smoke[1 - s];
        k.nullified = c.sucker[1 - s];
        _applyGuard(c, s, def, k);

        uint256 flags = uint256(int256(k.rel) + 1);
        if (k.braced) flags |= 1 << 2;
        if (k.smoked) flags |= 1 << 3;
        if (k.countered) flags |= 1 << 4;
        if (k.nullified) flags |= 1 << 5;
        if (k.blocked) flags |= 1 << 6;
        if (k.guardBroken) flags |= 1 << 7;
        if (k.interrupted) flags |= 1 << 8;
        h = Hit(true, k.d, int16(uint16(k.aid)), int16(uint16(b.s[1 - s].active)), int16(uint16(flags)));
    }

    /// @dev the guard triangle (+ Smoke Bomb / Sucker Punch): Brace blocks LIGHT, HEAVY breaks it for ⅔, LIGHT interrupts HEAVY
    function _applyGuard(Ctx memory c, uint8 s, Fighter memory def, Calc memory k) private pure {
        if (k.nullified) {
            k.d = 0;
            return;
        }
        bool heavy = R.isHeavy(k.cost);
        if (k.braced) {
            if (heavy) {
                k.d = (2 * k.d + 2) / 3; // guard break: ⅔ gets through
                k.guardBroken = true;
            } else {
                k.d = 0; // a Brace fully blocks a LIGHT attack
                k.blocked = true;
            }
        }
        if (k.smoked && !k.braced) k.d = _ceilHalf(k.d);
        if (heavy && isAttack(c.acts[1 - s]) && !k.braced) {
            (, uint8 ocost,,) = R.attack(_atkId(def, c.acts[1 - s]));
            if (!R.isHeavy(ocost)) {
                k.d = _ceilHalf(k.d);
                k.interrupted = true;
            }
        }
    }

    function _brace(Bout memory b, Ctx memory c) private pure {
        for (uint8 s = 0; s < 2; s++) {
            Side memory sd = b.s[s];
            if (c.acts[s] == BRACE) {
                uint8 gain = sd.braceStreak == 0 ? 1 : 0;
                sd.grit = _clamp(int256(uint256(sd.grit)) + int256(uint256(gain)));
                sd.braceStreak += 1;
                _push(c, 3, int16(uint16(s)), int16(uint16(gain)), 0, 0, 0);
            } else {
                sd.braceStreak = 0;
            }
            sd.last = int16(uint16(c.acts[s]));
        }
    }

    /// @dev E2 (hard-wired in v1): an unpunished Switch refunds its retreat cost
    function _refunds(Bout memory b, Ctx memory c) private pure {
        for (uint8 s = 0; s < 2; s++) {
            if (isSwitch(c.acts[s]) && !isAttack(c.acts[1 - s]) && c.swIdx[s] >= 0) {
                Ev memory sw = c.ev[uint256(c.swIdx[s])];
                b.s[s].grit = _clamp(int256(uint256(b.s[s].grit)) + int256(sw.c));
                sw.d = 1;
            }
        }
    }

    function _kos(Bout memory b, Ctx memory c) private pure {
        for (uint8 s = 0; s < 2; s++) {
            Side memory sd = b.s[s];
            Fighter memory f = sd.f[sd.active];
            if (f.hp <= 0 && f.alive) {
                f.hp = 0;
                f.alive = false;
                f.revealed = true;
                c.koed[s] = true;
                b.s[1 - s].kos += 1;
                _push(c, 4, int16(uint16(s)), int16(uint16(sd.active)), int16(uint16(1 - s)), 0, 0);
            }
        }
    }

    /* ---------------- end of turn ---------------- */
    function _aliveCount(Side memory s) private pure returns (uint8 n) {
        for (uint8 i = 0; i < s.nF; i++) if (s.f[i].alive) n++;
    }

    function _hpPermille(Side memory s) private pure returns (uint256) {
        uint256 hp;
        uint256 max;
        for (uint8 i = 0; i < s.nF; i++) {
            if (s.f[i].alive && s.f[i].hp > 0) hp += uint256(uint16(s.f[i].hp));
            max += uint256(uint16(s.f[i].maxHp));
        }
        return (hp * 1000) / (max == 0 ? 1 : max);
    }

    function _end(Bout memory b, Ctx memory c, int8 winner, uint8 reason) private pure {
        b.phase = PHASE_OVER;
        b.winner = winner;
        b.reason = reason;
        _push(c, 7, int16(winner), int16(uint16(reason)), 0, 0, 0);
    }

    function _finishTurn(Bout memory b, Ctx memory c) private pure {
        if (b.lazy) {
            (uint8 m0, uint8 m1) = openNeed(b);
            if (m0 | m1 != 0) {
                b.phase = PHASE_OPEN; // the rest of the turn needs private data → the Arena collects the openings, then calls `finish`
                return;
            }
        }
        Side memory s0 = b.s[0];
        Side memory s1 = b.s[1];

        if (b.sudden) {
            if (c.koed[0] && c.koed[1]) return _end(b, c, 2, REASON_DRAW);
            if (c.koed[0]) return _end(b, c, 1, REASON_KO);
            if (c.koed[1]) return _end(b, c, 0, REASON_KO);
        } else {
            uint8 target = b.fmt.koTarget;
            bool r0 = s0.kos >= target;
            bool r1 = s1.kos >= target;
            if (r0 && r1) {
                if (_aliveCount(s0) == 0 || _aliveCount(s1) == 0) return _end(b, c, 2, REASON_DRAW);
                b.sudden = true;
                _push(c, 6, 0, 0, 0, 0, 0);
                for (uint8 s = 0; s < 2; s++) {
                    Side memory sd = b.s[s];
                    uint8 idx;
                    for (uint8 i = 0; i < sd.nF; i++) {
                        if (sd.f[i].alive) {
                            idx = i;
                            break;
                        }
                    }
                    sd.active = idx;
                    Fighter memory f = sd.f[idx];
                    f.hp = int16(uint16(_ceilHalf(uint256(uint16(f.maxHp)))));
                    f.revealed = true;
                    _push(c, 5, int16(uint16(s)), int16(uint16(idx)), 0, 0, 0);
                }
                return;
            }
            if (r0) return _end(b, c, 0, REASON_KO);
            if (r1) return _end(b, c, 1, REASON_KO);
        }

        if (b.turn >= b.fmt.turnCap) {
            if (s0.kos != s1.kos) return _end(b, c, s0.kos > s1.kos ? int8(0) : int8(1), REASON_DECISION);
            uint256 h0 = _hpPermille(s0);
            uint256 h1 = _hpPermille(s1);
            if (h0 != h1) return _end(b, c, h0 > h1 ? int8(0) : int8(1), REASON_DECISION);
            if (s0.dealt != s1.dealt) return _end(b, c, s0.dealt > s1.dealt ? int8(0) : int8(1), REASON_DECISION);
            return _end(b, c, 2, REASON_DRAW);
        }

        (bool n0, bool n1) = needsReplacement(b);
        if (n0 || n1) b.phase = PHASE_REPLACE;
    }

    /* ---------------- replacement / forfeit ---------------- */
    function _needs(Side memory s) private pure returns (bool) {
        return !s.f[s.active].alive && _aliveCount(s) > 0;
    }

    function needsReplacement(Bout memory b) internal pure returns (bool, bool) {
        return (_needs(b.s[0]), _needs(b.s[1]));
    }

    function isLegalReplacement(Bout memory b, uint8 side, uint8 pick) internal pure returns (bool) {
        if (b.phase != PHASE_REPLACE) return false;
        Side memory s = b.s[side];
        if (s.f[s.active].alive) return false;
        return pick < s.nF && s.f[pick].alive;
    }

    /// @notice choices[side] = slot to bring in (ignored for a side that needs none). In place; returns events.
    function applyReplacements(Bout memory b, uint8 c0, uint8 c1) internal pure returns (Ev[] memory) {
        require(b.phase == PHASE_REPLACE, "phase");
        Ctx memory c;
        c.ev = new Ev[](4);
        uint8[2] memory choice = [c0, c1];
        bool[2] memory need;
        (need[0], need[1]) = needsReplacement(b);
        for (uint8 s = 0; s < 2; s++) {
            if (!need[s]) continue;
            require(isLegalReplacement(b, s, choice[s]), "illegal replacement");
            require(!b.lazy || b.s[s].f[choice[s]].maxHp > 0, "unopened");
            b.s[s].active = choice[s];
            b.s[s].f[choice[s]].revealed = true;
            _push(c, 5, int16(uint16(s)), int16(uint16(choice[s])), 0, 0, 0);
        }
        b.phase = PHASE_TURN;
        Ev[] memory ev = c.ev;
        uint256 n = c.n;
        assembly {
            mstore(ev, n)
        }
        return ev;
    }

    /* ---------------- hidden loadouts (lazy bouts) ---------------- */
    function _unopenedFirstAlive(Side memory sd) private pure returns (uint8) {
        for (uint8 i = 0; i < sd.nF; i++) {
            if (sd.f[i].alive) return sd.f[i].maxHp == 0 ? uint8(1) << i : 0;
        }
        return 0;
    }

    function _unopenedAll(Side memory sd) private pure returns (uint8 m) {
        for (uint8 i = 0; i < sd.nF; i++) if (sd.f[i].maxHp == 0) m |= uint8(1) << i;
    }

    /// @notice Fighter slots (bitmask per side) that must be opened before the end of this turn can be decided. Only two moments
    ///         read private roster data: sudden-death re-entry (the first living fighter) and a tied turn-cap decision (every max HP).
    ///         (0,0) = nothing to open. Always (0,0) for non-lazy bouts.
    function openNeed(Bout memory b) internal pure returns (uint8 m0, uint8 m1) {
        if (!b.lazy) return (0, 0);
        Side memory s0 = b.s[0];
        Side memory s1 = b.s[1];
        if (!b.sudden) {
            bool r0 = s0.kos >= b.fmt.koTarget;
            bool r1 = s1.kos >= b.fmt.koTarget;
            if (r0 && r1) {
                if (_aliveCount(s0) == 0 || _aliveCount(s1) == 0) return (0, 0); // plain draw
                return (_unopenedFirstAlive(s0), _unopenedFirstAlive(s1));
            }
            if (r0 || r1) return (0, 0); // somebody simply wins
        }
        if (b.turn >= b.fmt.turnCap && s0.kos == s1.kos) return (_unopenedAll(s0), _unopenedAll(s1));
        return (0, 0);
    }

    /// @notice Resume a bout that paused with PHASE_OPEN once every needed card has been opened.
    function finish(Bout memory b) internal pure returns (Ev[] memory) {
        require(b.phase == PHASE_OPEN, "phase");
        b.phase = PHASE_TURN;
        Ctx memory c;
        c.ev = new Ev[](8);
        _finishTurn(b, c);
        Ev[] memory ev = c.ev;
        uint256 n = c.n;
        assembly {
            mstore(ev, n)
        }
        return ev;
    }

    /// @notice Fill in a placeholder fighter (lazy bouts). Same HP maths as `create`.
    function openFighter(Bout memory b, uint8 side, uint8 slot, uint8 style, uint8 a0, uint8 a1, uint8 spreadId) internal pure {
        require(R.isLegalBuild(style, a0, a1, spreadId), "illegal build");
        Fighter memory f = b.s[side].f[slot];
        require(f.maxHp == 0 && slot < b.s[side].nF, "already open");
        (uint8 hp, uint8 retreat) = R.spread(spreadId);
        uint256 scaled = (uint256(hp) * b.fmt.hpPct) / 100;
        if (scaled < 1) scaled = 1;
        f.style = style;
        f.atk0 = a0;
        f.atk1 = a1;
        f.spread = spreadId;
        f.maxHp = int16(uint16(scaled));
        f.hp = int16(uint16(scaled));
        f.retreat = retreat;
    }

    /// @notice Fill in a placeholder trick (lazy bouts).
    function openTrick(Bout memory b, uint8 side, uint8 j, uint8 trickId) internal pure {
        Trick memory t = b.s[side].t[j];
        require(t.id == UNOPENED_TRICK && j < b.s[side].nT && trickId < R.TRICK_COUNT, "bad trick");
        t.id = trickId;
    }

    function forfeit(Bout memory b, uint8 loser) internal pure returns (Ev[] memory) {
        Ctx memory c;
        c.ev = new Ev[](1);
        _end(b, c, int8(uint8(1 - loser)), REASON_FORFEIT);
        return c.ev;
    }
}
