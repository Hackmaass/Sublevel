// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Engine} from "./Engine.sol";
import {RulebookV1 as R} from "./RulebookV1.sol";

/// @title BoutCodec — packs a bout into 88 × int16 (176 bytes, big-endian) and back.
/// @notice Same layout as `packages/engine/src/encode.ts` (see its header). The Arena stores bouts in this form (6 storage slots).
library BoutCodec {
    uint256 internal constant STATE_LEN = 88;
    uint256 internal constant STATE_BYTES = 176;

    function _r(bytes memory d, uint256 i) private pure returns (int16 v) {
        uint16 hi = uint16(uint8(d[i * 2]));
        uint16 lo = uint16(uint8(d[i * 2 + 1]));
        return int16((hi << 8) | lo);
    }

    function _w(bytes memory d, uint256 i, int256 v) private pure {
        uint16 u = uint16(int16(v));
        d[i * 2] = bytes1(uint8(u >> 8));
        d[i * 2 + 1] = bytes1(uint8(u));
    }

    function unpack(bytes memory d) internal pure returns (Engine.Bout memory b) {
        require(d.length == STATE_BYTES, "state length");
        b.fmt = R.format(uint8(uint16(_r(d, 0))));
        b.turn = uint8(uint16(_r(d, 1)));
        b.phase = uint8(uint16(_r(d, 2)));
        b.sudden = _r(d, 3) != 0;
        b.winner = int8(_r(d, 4));
        b.reason = uint8(uint16(_r(d, 5)));
        for (uint256 s = 0; s < 2; s++) {
            uint256 base = 6 + s * 41;
            Engine.Side memory sd = b.s[s];
            sd.nF = uint8(uint16(_r(d, base)));
            sd.active = uint8(uint16(_r(d, base + 1)));
            sd.grit = uint8(uint16(_r(d, base + 2)));
            sd.braceStreak = uint8(uint16(_r(d, base + 3)));
            sd.kos = uint8(uint16(_r(d, base + 4)));
            sd.dealt = uint16(_r(d, base + 5));
            sd.last = _r(d, base + 6);
            sd.nT = uint8(uint16(_r(d, base + 7)));
            for (uint256 i = 0; i < 3; i++) {
                uint256 o = base + 8 + i * 9;
                sd.f[i] = Engine.Fighter(uint8(uint16(_r(d, o))), uint8(uint16(_r(d, o + 1))), uint8(uint16(_r(d, o + 2))), uint8(uint16(_r(d, o + 3))), _r(d, o + 4), _r(d, o + 5), uint8(uint16(_r(d, o + 6))), _r(d, o + 7) != 0, _r(d, o + 8) != 0);
            }
            for (uint256 j = 0; j < 2; j++) {
                uint256 o = base + 35 + j * 3;
                sd.t[j] = Engine.Trick(uint8(uint16(_r(d, o))), _r(d, o + 1) != 0, _r(d, o + 2) != 0);
            }
        }
    }

    function pack(Engine.Bout memory b) internal pure returns (bytes memory d) {
        d = new bytes(STATE_BYTES);
        _w(d, 0, int256(uint256(b.fmt.id)));
        _w(d, 1, int256(uint256(b.turn)));
        _w(d, 2, int256(uint256(b.phase)));
        _w(d, 3, b.sudden ? int256(1) : int256(0));
        _w(d, 4, int256(b.winner));
        _w(d, 5, int256(uint256(b.reason)));
        for (uint256 s = 0; s < 2; s++) {
            uint256 base = 6 + s * 41;
            Engine.Side memory sd = b.s[s];
            _w(d, base, int256(uint256(sd.nF)));
            _w(d, base + 1, int256(uint256(sd.active)));
            _w(d, base + 2, int256(uint256(sd.grit)));
            _w(d, base + 3, int256(uint256(sd.braceStreak)));
            _w(d, base + 4, int256(uint256(sd.kos)));
            _w(d, base + 5, int256(uint256(sd.dealt)));
            _w(d, base + 6, int256(sd.last));
            _w(d, base + 7, int256(uint256(sd.nT)));
            for (uint256 i = 0; i < 3; i++) {
                uint256 o = base + 8 + i * 9;
                Engine.Fighter memory f = sd.f[i];
                _w(d, o, int256(uint256(f.style)));
                _w(d, o + 1, int256(uint256(f.atk0)));
                _w(d, o + 2, int256(uint256(f.atk1)));
                _w(d, o + 3, int256(uint256(f.spread)));
                _w(d, o + 4, int256(f.maxHp));
                _w(d, o + 5, int256(f.hp));
                _w(d, o + 6, int256(uint256(f.retreat)));
                _w(d, o + 7, f.revealed ? int256(1) : int256(0));
                _w(d, o + 8, f.alive ? int256(1) : int256(0));
            }
            for (uint256 j = 0; j < 2; j++) {
                uint256 o = base + 35 + j * 3;
                Engine.Trick memory t = sd.t[j];
                _w(d, o, int256(uint256(t.id)));
                _w(d, o + 1, t.used ? int256(1) : int256(0));
                _w(d, o + 2, t.revealed ? int256(1) : int256(0));
            }
        }
    }

    /// @dev events → int16[] flat (6 per event), same as encode.ts `encodeEvents`
    function packEvents(Engine.Ev[] memory ev) internal pure returns (bytes memory d) {
        d = new bytes(ev.length * 12);
        for (uint256 i = 0; i < ev.length; i++) {
            _w(d, i * 6, ev[i].t);
            _w(d, i * 6 + 1, ev[i].side);
            _w(d, i * 6 + 2, ev[i].a);
            _w(d, i * 6 + 3, ev[i].b);
            _w(d, i * 6 + 4, ev[i].c);
            _w(d, i * 6 + 5, ev[i].d);
        }
    }
}
