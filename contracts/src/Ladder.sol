// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title Ladder — ranked ratings and the Belt.
/// @notice Written ONLY by the Arena, and only when a RANKED bout (blind queue) settles. Two things live here:
///  • **Rating** — an Elo rating per player per format (start 1000, K = 32, floor 100). Zero-sum: what the winner gains the loser
///    loses, so beating a stronger opponent is worth more and farming weak ones is worth almost nothing.
///  • **The Belt** — one ERC-721 per format (token 0 = Lite, token 1 = Full). The first decisive ranked result in a format crowns
///    its winner; after that the belt changes hands only when the holder LOSES a ranked bout, and only to the player who beat them.
///    It is soulbound to the reign: the holder cannot sell or send it — the only way to own it is to take it.
///
/// WHY ON-CHAIN: a database operator could quietly rewrite who the champion is, or whose rating is what. Here the only code path
/// that moves either is `settle`, which the Arena calls from a verified bout result.
///
/// NOT CLAIMED: this does not stop one person from controlling two wallets (sybil). Rating gain scales with the opponent's rating
/// (Elo), which makes farming a weak alt nearly worthless, but a holder who throws a bout to their own alt can still pass the belt.
/// The second player into the queue can also see who is waiting, so cherry-picking an opponent is possible; Elo makes it unprofitable
/// for rating but not for a belt defence. Both are listed as known limits (README).
contract Ladder is ERC721 {
    using Strings for uint256;

    uint8 public constant LITE = 0;
    uint8 public constant FULL = 1;
    int32 public constant START_RATING = 1000;
    int32 public constant K = 32;
    int32 public constant FLOOR = 100;

    struct Standing {
        int32 rating; // meaningful only once `seen`
        uint32 bouts;
        uint32 wins;
        uint32 losses;
        uint32 draws;
        bool seen;
    }

    struct Reign {
        address holder;
        uint64 since;
        uint32 defenses; // ranked bouts won as holder in this reign
        uint32 reigns; // how many times the belt has changed hands (incl. the first crowning)
    }

    address public immutable deployer;
    address public arena;
    bool public wired;
    bool private _awarding;

    mapping(uint8 => mapping(address => Standing)) internal _standing;
    mapping(uint8 => Reign) internal _reign;

    event Rated(uint256 indexed boutId, uint8 format, address a, address b, int32 ratingA, int32 ratingB, int8 winner);
    event BeltChanged(uint8 indexed format, address indexed from, address indexed to, uint256 boutId, uint32 reign);
    event BeltDefended(uint8 indexed format, address indexed holder, uint256 boutId, uint32 defenses);
    event Wired(address arena);

    error NotArena();
    error NotDeployer();
    error AlreadyWired();
    error Soulbound();

    constructor() ERC721("SUBLEVEL Belt", "BELT") {
        deployer = msg.sender;
    }

    /// @notice One-shot: which Arena may settle ranked bouts. The deployer has no other power.
    function wire(address arena_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (wired) revert AlreadyWired();
        require(arena_ != address(0), "zero");
        wired = true;
        arena = arena_;
        emit Wired(arena_);
    }

    /* ---------------- settlement (Arena only) ---------------- */
    /// @param winner 0 or 1 (the winning seat) or 2 for a draw. Voided bouts are never reported.
    function settle(uint8 format, address p0, address p1, int8 winner, uint256 boutId) external {
        if (msg.sender != arena) revert NotArena();
        Standing storage a = _standing[format][p0];
        Standing storage b = _standing[format][p1];
        int32 ra = a.seen ? a.rating : START_RATING;
        int32 rb = b.seen ? b.rating : START_RATING;

        int256 score0 = winner == 0 ? int256(1000) : winner == 1 ? int256(0) : int256(500);
        int256 delta = (int256(K) * (score0 - expectedPermille(int256(ra) - int256(rb)))) / 1000; // truncates toward zero
        a.rating = _clamp(int256(ra) + delta);
        b.rating = _clamp(int256(rb) - delta);
        a.seen = true;
        b.seen = true;
        a.bouts += 1;
        b.bouts += 1;
        if (winner == 0) {
            a.wins += 1;
            b.losses += 1;
        } else if (winner == 1) {
            b.wins += 1;
            a.losses += 1;
        } else {
            a.draws += 1;
            b.draws += 1;
        }
        emit Rated(boutId, format, p0, p1, a.rating, b.rating, winner);

        if (winner == 2) return;
        address won = winner == 0 ? p0 : p1;
        address lost = winner == 0 ? p1 : p0;
        Reign storage r = _reign[format];
        if (r.holder == address(0) || r.holder == lost) _crown(format, won, boutId);
        else if (r.holder == won) {
            r.defenses += 1;
            emit BeltDefended(format, won, boutId, r.defenses);
        }
        // holder not in this bout: nothing moves
    }

    function _clamp(int256 v) private pure returns (int32) {
        return v < int256(FLOOR) ? FLOOR : int32(v);
    }

    function _crown(uint8 format, address to, uint256 boutId) private {
        Reign storage r = _reign[format];
        address from = r.holder;
        _awarding = true;
        if (_ownerOf(format) == address(0)) _mint(to, format);
        else _update(to, format, address(0));
        _awarding = false;
        r.holder = to;
        r.since = uint64(block.timestamp);
        r.defenses = 0;
        r.reigns += 1;
        emit BeltChanged(format, from, to, boutId, r.reigns);
    }

    /// @dev soulbound to the reign: only `_crown` can move the token
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (!_awarding) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    /* ---------------- Elo ---------------- */
    /// @notice Expected score of the first player, in permille (500 = even), for a rating difference d = mine − theirs.
    ///         The standard logistic 1/(1+10^(−d/400)), sampled every 50 points and interpolated; clamped at ±800.
    function expectedPermille(int256 d) public pure returns (int256) {
        uint16[17] memory t = [uint16(500), 571, 640, 703, 760, 808, 849, 882, 909, 930, 947, 960, 969, 977, 983, 987, 990];
        bool neg = d < 0;
        uint256 x = uint256(neg ? -d : d);
        uint256 e;
        if (x >= 800) e = t[16];
        else {
            uint256 i = x / 50;
            e = uint256(t[i]) + ((uint256(t[i + 1]) - uint256(t[i])) * (x % 50)) / 50;
        }
        return neg ? int256(1000) - int256(e) : int256(e);
    }

    /* ---------------- views ---------------- */
    function ratingOf(uint8 format, address who) external view returns (int32) {
        Standing storage s = _standing[format][who];
        return s.seen ? s.rating : START_RATING;
    }

    function standingOf(uint8 format, address who) external view returns (int32 rating, uint32 bouts, uint32 wins, uint32 losses, uint32 draws) {
        Standing storage s = _standing[format][who];
        return (s.seen ? s.rating : START_RATING, s.bouts, s.wins, s.losses, s.draws);
    }

    function reignOf(uint8 format) external view returns (address holder, uint64 since, uint32 defenses, uint32 reigns) {
        Reign storage r = _reign[format];
        return (r.holder, r.since, r.defenses, r.reigns);
    }

    /* ---------------- metadata (fully on-chain) ---------------- */
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        uint8 format = uint8(id);
        Reign storage r = _reign[format];
        string memory kind = format == FULL ? "Full" : "Lite";
        string memory holder = Strings.toHexString(r.holder);
        string memory svg = string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'><rect width='600' height='300' fill='#0b0b0c'/>",
            "<rect x='20' y='20' width='560' height='260' fill='none' stroke='#ff5a1f' stroke-width='8'/>",
            "<text x='300' y='120' text-anchor='middle' font-family='Impact,sans-serif' font-size='64' fill='#e9e4d8'>SUBLEVEL</text>",
            "<text x='300' y='190' text-anchor='middle' font-family='Impact,sans-serif' font-size='48' fill='#ff5a1f'>", kind, " CHAMPION</text>",
            "<text x='300' y='245' text-anchor='middle' font-family='monospace' font-size='15' fill='#8e8a7e'>", holder, "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"SUBLEVEL Belt - ', kind, '","description":"Changes hands only when the holder loses a ranked bout. Soulbound to the reign: it cannot be sold or sent.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '","attributes":[',
            '{"trait_type":"Format","value":"', kind, '"},{"trait_type":"Holder","value":"', holder, '"},',
            '{"trait_type":"Defenses this reign","value":', uint256(r.defenses).toString(), '},{"trait_type":"Reigns","value":', uint256(r.reigns).toString(), "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
