// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Cards} from "./Cards.sol";
import {Armory} from "./Armory.sol";
import {Arena} from "./Arena.sol";
import {Ladder} from "./Ladder.sol";

/// @title Bootstrap — deploys and wires the whole system in ONE transaction, then has no further role.
/// @notice `Cards` and `Armory` only let their constructor's caller call `wire()` (once). If a person, a smart wallet or a factory
///         (CreateX) deployed them directly, that caller would hold a — tiny, one-shot — power. Here the caller is THIS contract,
///         which wires inside its own constructor and exposes nothing: after the transaction nobody can ever wire anything again.
///         Deploy this one contract from any account or factory; read the three addresses from the public getters / the event.
contract Bootstrap {
    Cards public immutable cards;
    Armory public immutable armory;
    Arena public immutable arena;
    Ladder public immutable ladder;

    event Deployed(address cards, address armory, address arena, bool fullEnabled);
    event LadderDeployed(address ladder);

    constructor(bool fullEnabled) {
        Cards c = new Cards();
        Armory a = new Armory(c);
        Ladder l = new Ladder();
        Arena r = new Arena(c, a, l, fullEnabled);
        c.wire(address(a), address(r));
        a.wire(address(r));
        l.wire(address(r));
        cards = c;
        armory = a;
        arena = r;
        ladder = l;
        emit Deployed(address(c), address(a), address(r), fullEnabled);
        emit LadderDeployed(address(l));
    }
}
