// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {RulebookV1 as R} from "./RulebookV1.sol";
import {RulebookNames as N} from "./RulebookNames.sol";

/// @title Cards — fighters and dirty tricks as ERC-721, each with a career nobody can edit.
/// @notice A card is **identity + an immutable build + a record**. Mechanics live in the Rulebook (cards store ids, not numbers).
///         The record can ONLY be written by the Arena, which is wired exactly once at deployment (no admin can add a writer later).
///         Minting is free (gas only) — no payable function, so a low-balance wallet never trips Monad's reserve-balance rule.
///
/// TRUST: after `wire()`, the deployer has NO power at all. There is no owner, no pause, no upgrade path.
contract Cards is ERC721, IERC4906 {
    using Strings for uint256;

    /* ---------------- types ---------------- */
    uint8 public constant KIND_FIGHTER = 0;
    uint8 public constant KIND_TRICK = 1;

    struct Card {
        uint8 kind;
        uint8 style;
        uint8 atk0;
        uint8 atk1;
        uint8 spread;
        uint8 trickId;
        uint64 mintedAt;
        address creator;
        bytes32 artHash;
    }

    /// @dev v1 counters are UNRANKED: they come from challenge play (alt wallets can farm them) and say so in tokenURI.
    struct Record {
        uint32 bouts;
        uint32 wins;
        uint32 losses;
        uint32 draws;
        uint32 knockedOut;
        uint16 streak;
        uint16 bestStreak;
        uint32 scars; // bitmask, see SCAR_*
    }

    uint32 public constant SCAR_FIRST_WIN = 1 << 0;
    uint32 public constant SCAR_STREAK_3 = 1 << 1;
    uint32 public constant SCAR_STREAK_5 = 1 << 2;
    uint32 public constant SCAR_VETERAN_10 = 1 << 3;
    uint32 public constant SCAR_KNOCKED_OUT = 1 << 4;

    uint64 public constant MINT_COOLDOWN = 5 seconds;
    uint256 internal constant MAX_NAME = 32;
    uint256 internal constant MAX_URI = 160;

    /* ---------------- state ---------------- */
    uint256 public nextId;
    mapping(uint256 => Card) internal _card;
    mapping(uint256 => Record) internal _record;
    mapping(uint256 => string) internal _name;
    mapping(uint256 => string) internal _artURI;
    mapping(uint256 => bool) public locked;
    mapping(address => uint64) public lastMint;
    mapping(address => bool) public starterClaimed;

    address public immutable deployer;
    address public armory;
    address public arena;
    bool public wired;

    /* ---------------- events / errors ---------------- */
    event Minted(uint256 indexed id, address indexed owner, uint8 kind, uint8 style, uint8 atk0, uint8 atk1, uint8 spread, uint8 trickId, bytes32 artHash);
    event LockChanged(uint256 indexed id, bool locked);
    event Recorded(uint256 indexed id, uint8 outcome, bool knockedOut, uint32 bouts, uint16 streak, uint32 scars);
    event Wired(address armory, address arena);

    error Locked(uint256 id);
    error NotArmory();
    error NotArena();
    error AlreadyWired();
    error NotDeployer();
    error Cooldown(uint64 readyAt);
    error IllegalBuild();
    error BadText();
    error StarterClaimed();
    error BadId();

    constructor() ERC721("SUBLEVEL Cards", "SUB") {
        deployer = msg.sender;
    }

    /// @notice One-shot wiring of the only two contracts allowed to lock cards (Armory) and write records (Arena).
    function wire(address armory_, address arena_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (wired) revert AlreadyWired();
        require(armory_ != address(0) && arena_ != address(0), "zero");
        wired = true;
        armory = armory_;
        arena = arena_;
        emit Wired(armory_, arena_);
    }

    /* ---------------- minting (free) ---------------- */
    function _cooldown() internal {
        uint64 ready = lastMint[msg.sender] + MINT_COOLDOWN;
        if (block.timestamp < ready) revert Cooldown(ready);
        lastMint[msg.sender] = uint64(block.timestamp);
    }

    /// @dev names/URIs are user text: restrict to a safe alphabet so JSON/SVG in tokenURI can never be broken or injected into.
    function _checkName(string memory s) internal pure {
        bytes memory b = bytes(s);
        if (b.length == 0 || b.length > MAX_NAME) revert BadText();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c == 0x20 || c == 0x2D || c == 0x27 || c == 0x2E || c == 0x21;
            if (!ok) revert BadText();
        }
    }

    function _checkURI(string memory s) internal pure {
        bytes memory b = bytes(s);
        if (b.length > MAX_URI) revert BadText();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            // printable ASCII except quote, backslash, angle brackets, whitespace
            if (c <= 0x20 || c >= 0x7F || c == 0x22 || c == 0x5C || c == 0x3C || c == 0x3E) revert BadText();
        }
    }

    function _mintCard(address to, Card memory c, string memory name_, string memory uri_) internal returns (uint256 id) {
        id = nextId++;
        c.mintedAt = uint64(block.timestamp);
        c.creator = to;
        _card[id] = c;
        _name[id] = name_;
        _artURI[id] = uri_;
        _mint(to, id); // _mint (not _safeMint): no receiver callback → no reentrancy surface
        emit Minted(id, to, c.kind, c.style, c.atk0, c.atk1, c.spread, c.trickId, c.artHash);
    }

    /// @notice Mint a fighter. The build must be legal: ONE light + ONE heavy attack of its style.
    function mintFighter(uint8 style, uint8 atk0, uint8 atk1, uint8 spreadId, bytes32 artHash, string calldata artURI_, string calldata name_) external returns (uint256) {
        if (!R.isLegalBuild(style, atk0, atk1, spreadId)) revert IllegalBuild();
        _checkName(name_);
        _checkURI(artURI_);
        _cooldown();
        return _mintCard(msg.sender, Card(KIND_FIGHTER, style, atk0, atk1, spreadId, 0, 0, address(0), artHash), name_, artURI_);
    }

    /// @notice Mint a Dirty Trick card.
    function mintTrick(uint8 trickId, bytes32 artHash, string calldata artURI_, string calldata name_) external returns (uint256) {
        if (trickId >= R.TRICK_COUNT) revert BadId();
        _checkName(name_);
        _checkURI(artURI_);
        _cooldown();
        return _mintCard(msg.sender, Card(KIND_TRICK, 0, 0, 0, 0, trickId, 0, address(0), artHash), name_, artURI_);
    }

    /// @notice Once per address: two preset fighters + one trick, so anyone can play in seconds. (Art placeholders.)
    function claimStarter(uint8 presetA, uint8 presetB, uint8 trickId) external returns (uint256 f0, uint256 f1, uint256 t0) {
        if (starterClaimed[msg.sender]) revert StarterClaimed();
        if (presetA >= N.PRESET_COUNT || presetB >= N.PRESET_COUNT || trickId >= R.TRICK_COUNT) revert BadId();
        starterClaimed[msg.sender] = true;
        f0 = _mintPreset(presetA);
        f1 = _mintPreset(presetB);
        t0 = _mintCard(msg.sender, Card(KIND_TRICK, 0, 0, 0, 0, trickId, 0, address(0), bytes32(0)), N.trickName(trickId), "");
    }

    function _mintPreset(uint8 id) internal returns (uint256) {
        (string memory nm, uint8 style, uint8 a0, uint8 a1, uint8 sp) = N.preset(id);
        return _mintCard(msg.sender, Card(KIND_FIGHTER, style, a0, a1, sp, 0, 0, address(0), bytes32(0)), nm, "");
    }

    /* ---------------- locking (Armory only) ---------------- */
    function setLocked(uint256[] calldata ids, bool v) external {
        if (msg.sender != armory) revert NotArmory();
        for (uint256 i = 0; i < ids.length; i++) {
            locked[ids[i]] = v;
            emit LockChanged(ids[i], v);
        }
    }

    /// @dev a locked card cannot be transferred (the lock replaces an external escrow). Mint/burn pass through.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && locked[tokenId]) revert Locked(tokenId);
        return super._update(to, tokenId, auth);
    }

    /* ---------------- records (Arena only) ---------------- */
    /// @param outcome 0 loss, 1 win, 2 draw
    function recordBout(uint256 id, uint8 outcome, bool knockedOut) external {
        if (msg.sender != arena) revert NotArena();
        _requireOwned(id);
        Record storage r = _record[id];
        r.bouts += 1;
        uint32 scars = r.scars;
        if (outcome == 1) {
            r.wins += 1;
            r.streak += 1;
            if (r.streak > r.bestStreak) r.bestStreak = r.streak;
            if (r.wins == 1) scars |= SCAR_FIRST_WIN;
            if (r.streak >= 3) scars |= SCAR_STREAK_3;
            if (r.streak >= 5) scars |= SCAR_STREAK_5;
        } else if (outcome == 0) {
            r.losses += 1;
            r.streak = 0;
        } else {
            r.draws += 1;
            r.streak = 0;
        }
        if (knockedOut) {
            r.knockedOut += 1;
            scars |= SCAR_KNOCKED_OUT;
        }
        if (r.bouts >= 10) scars |= SCAR_VETERAN_10;
        r.scars = scars;
        emit Recorded(id, outcome, knockedOut, r.bouts, r.streak, scars);
        emit MetadataUpdate(id); // ERC-4906: wallets/marketplaces refresh the card
    }

    /* ---------------- views ---------------- */
    function cardData(uint256 id) external view returns (Card memory) {
        _requireOwned(id);
        return _card[id];
    }

    function recordOf(uint256 id) external view returns (Record memory) {
        _requireOwned(id);
        return _record[id];
    }

    function nameOf(uint256 id) external view returns (string memory) {
        _requireOwned(id);
        return _name[id];
    }

    /// @notice Enumerable-by-owner view that never depends on eth_getLogs (public RPC caps it at 100 blocks).
    function cardsOf(address owner_, uint256 from, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 bal = balanceOf(owner_);
        uint256 total = nextId;
        uint256 found;
        uint256[] memory tmp = new uint256[](limit);
        // linear scan over ids [from, total): fine for testnet scale; the indexer is the production path
        for (uint256 i = from; i < total && found < limit; i++) {
            if (_ownerOf(i) == owner_) tmp[found++] = i;
            if (found == bal) break;
        }
        ids = new uint256[](found);
        for (uint256 j = 0; j < found; j++) ids[j] = tmp[j];
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    /* ---------------- metadata (fully on-chain JSON) ---------------- */
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        Card memory c = _card[id];
        string memory nm = _name[id];
        string memory json = string.concat(
            '{"name":"', nm, '","description":"SUBLEVEL card #', id.toString(), '. Its record is written only by the Arena contract. v1 record is UNRANKED (challenge play).",',
            '"image":"', _image(id, c, nm), '","attributes":[', _attributes(id, c), "]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _trait(string memory k, string memory v) private pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":"', v, '"}');
    }

    function _num(string memory k, uint256 v) private pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":', v.toString(), "}");
    }

    function _attributes(uint256 id, Card memory c) private view returns (string memory) {
        Record memory r = _record[id];
        string memory head;
        if (c.kind == KIND_FIGHTER) {
            head = string.concat(
                _trait("Kind", "Fighter"), ",", _trait("Style", N.styleName(c.style)), ",", _trait("Attack 1", N.attackName(c.atk0)), ",", _trait("Attack 2", N.attackName(c.atk1)), ",", _trait("Spread", N.spreadName(c.spread))
            );
        } else {
            head = string.concat(_trait("Kind", "Dirty Trick"), ",", _trait("Trick", N.trickName(c.trickId)));
        }
        return string.concat(
            head, ",", _trait("Record scope", "Unranked (v1)"), ",", _num("Bouts", r.bouts), ",", _num("Wins", r.wins), ",", _num("Losses", r.losses), ",", _num("Draws", r.draws), ",",
            _num("Times knocked out", r.knockedOut), ",", _num("Best streak", r.bestStreak), ",", _num("Scars", r.scars)
        );
    }

    function _image(uint256 id, Card memory c, string memory nm) private view returns (string memory) {
        string memory uri = _artURI[id];
        if (bytes(uri).length > 0) return uri;
        Record memory r = _record[id];
        string memory sub = c.kind == KIND_FIGHTER ? N.styleName(c.style) : N.trickName(c.trickId);
        string memory svg = string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'><rect width='400' height='560' fill='#e9e4d8'/><rect x='20' y='20' width='360' height='380' fill='#cdc7b3' stroke='#0b0b0c' stroke-width='6'/>",
            "<text x='28' y='470' font-family='Impact,sans-serif' font-size='54' fill='#0b0b0c'>", nm, "</text>",
            "<text x='28' y='510' font-family='monospace' font-size='24' fill='#333'>", sub, "  W", uint256(r.wins).toString(), " L", uint256(r.losses).toString(), "</text></svg>"
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }
}
