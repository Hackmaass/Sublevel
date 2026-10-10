// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Cards} from "./Cards.sol";

/// @title Armory — your public Pool of cards, plus session-key delegation.
/// @notice Registering a pool LOCKS its cards (a locked card can't be transferred; one pool at a time). Only the OWNER WALLET can
///         register / unregister a pool or authorise a session key. A session key can later only play moves inside a bout
///         (commit / reveal / replacement) — it can never lock, move, approve or ante a card. A leaked session key can at worst
///         forfeit one bout.
contract Armory {
    Cards public immutable cards;
    address public immutable deployer;
    address public arena;
    bool public wired;

    uint8 public constant FORMAT_LITE = 0;
    uint8 public constant FORMAT_FULL = 1;
    uint64 public constant MAX_SESSION = 7 days;

    struct Pool {
        address owner;
        uint8 format;
        uint8 n;
        bool active;
        bool inBout;
        uint256[8] ids;
    }

    mapping(uint256 => Pool) internal _pool;
    uint256 public nextPool;
    /// @notice owner → session key → expiry (unix seconds)
    mapping(address => mapping(address => uint64)) public sessionExpiry;

    event PoolRegistered(uint256 indexed poolId, address indexed owner, uint8 format, uint256[] ids);
    event PoolUnregistered(uint256 indexed poolId);
    event PoolInBout(uint256 indexed poolId, bool inBout);
    event SessionAuthorized(address indexed owner, address indexed key, uint64 expiry);
    event SessionRevoked(address indexed owner, address indexed key);
    event Wired(address arena);

    error NotOwner();
    error NotArena();
    error NotDeployer();
    error AlreadyWired();
    error BadPool(string why);
    error PoolBusy(uint256 poolId);

    constructor(Cards cards_) {
        cards = cards_;
        deployer = msg.sender;
    }

    /// @notice One-shot: tells the Armory which Arena may flag pools as in-bout. The deployer has no other power.
    function wire(address arena_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (wired) revert AlreadyWired();
        require(arena_ != address(0), "zero");
        wired = true;
        arena = arena_;
        emit Wired(arena_);
    }

    /* ---------------- pools (owner wallet only) ---------------- */
    function poolSize(uint8 format) public pure returns (uint8) {
        if (format == FORMAT_LITE) return 3; // 2 fighters + 1 trick, all public
        if (format == FORMAT_FULL) return 8; // ≥ 3 fighters + ≥ 2 tricks; which 5 you bring stays secret
        revert BadPool("format");
    }

    function register(uint8 format, uint256[] calldata ids) external returns (uint256 poolId) {
        if (ids.length != poolSize(format)) revert BadPool("size");
        uint256 fighters;
        uint256 tricks;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (cards.ownerOf(id) != msg.sender) revert BadPool("not owner");
            if (cards.locked(id)) revert BadPool("already in a pool");
            for (uint256 j = 0; j < i; j++) if (ids[j] == id) revert BadPool("duplicate");
            if (cards.cardData(id).kind == cards.KIND_FIGHTER()) fighters++;
            else tricks++;
        }
        if (format == FORMAT_LITE) {
            if (fighters != 2 || tricks != 1) revert BadPool("lite needs 2 fighters + 1 trick");
        } else if (fighters < 3 || tricks < 2) {
            revert BadPool("full needs >=3 fighters + >=2 tricks");
        }

        poolId = nextPool++;
        Pool storage p = _pool[poolId];
        p.owner = msg.sender;
        p.format = format;
        p.n = uint8(ids.length);
        p.active = true;
        for (uint256 k = 0; k < ids.length; k++) p.ids[k] = ids[k];
        cards.setLocked(ids, true);
        emit PoolRegistered(poolId, msg.sender, format, ids);
    }

    function unregister(uint256 poolId) external {
        Pool storage p = _pool[poolId];
        if (p.owner != msg.sender) revert NotOwner();
        if (!p.active) revert BadPool("inactive");
        if (p.inBout) revert PoolBusy(poolId);
        p.active = false;
        uint256[] memory ids = new uint256[](p.n);
        for (uint256 i = 0; i < p.n; i++) ids[i] = p.ids[i];
        cards.setLocked(ids, false);
        emit PoolUnregistered(poolId);
    }

    /// @dev Arena flags a pool while it is in a bout so it can't be unregistered (and its cards stay locked) until the bout ends.
    function setInBout(uint256 poolId, bool v) external {
        if (msg.sender != arena) revert NotArena();
        _pool[poolId].inBout = v;
        emit PoolInBout(poolId, v);
    }

    function poolInfo(uint256 poolId) external view returns (address owner, uint8 format, uint8 n, bool active, bool inBout) {
        Pool storage p = _pool[poolId];
        return (p.owner, p.format, p.n, p.active, p.inBout);
    }

    function poolIds(uint256 poolId) external view returns (uint256[] memory ids) {
        Pool storage p = _pool[poolId];
        ids = new uint256[](p.n);
        for (uint256 i = 0; i < p.n; i++) ids[i] = p.ids[i];
    }

    /* ---------------- session keys (owner wallet only) ---------------- */
    function authorizeSession(address key, uint64 expiry) external {
        require(key != address(0) && key != msg.sender, "bad key");
        require(expiry > block.timestamp && expiry <= block.timestamp + MAX_SESSION, "bad expiry");
        sessionExpiry[msg.sender][key] = expiry;
        emit SessionAuthorized(msg.sender, key, expiry);
    }

    function revokeSession(address key) external {
        delete sessionExpiry[msg.sender][key];
        emit SessionRevoked(msg.sender, key);
    }

    function isSession(address owner, address key) external view returns (bool) {
        return sessionExpiry[owner][key] > block.timestamp;
    }
}
