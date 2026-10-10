"use client";

import { useGame } from "@/lib/game";
import { Stage } from "@/components/ui/Stage";
import { Title } from "@/components/screens/Title";
import { Lobby } from "@/components/screens/Lobby";
import { Match } from "@/components/screens/Match";
import { Manual } from "@/components/Manual";
import { ScanToJoin } from "@/components/JoinCard";
import { ChainSetup } from "@/components/ChainSetup";
import { getDeployment, useChain } from "@/lib/chainGame";
import { startRoom, useRoom } from "@/lib/room";
import { startProjectorBridge } from "@/lib/roomBridge";
import { useEffect } from "react";

export default function Home() {
  const screen = useGame((s) => s.screen);
  // the room (mock backend + relay) watches the game and answers spectator phones; it can never act on a bout
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("room") === "0") useRoom.setState({ on: false });
    const dep = getDeployment();
    if (dep) useChain.setState({ deployment: dep }); // the on-chain duel appears only once the contracts exist
    const stopRoom = startRoom();
    const stopBridge = startProjectorBridge();
    return () => {
      stopRoom();
      stopBridge();
    };
  }, []);
  return (
    <Stage>
      {screen === "title" && <Title />}
      {screen === "lobby" && <Lobby />}
      {screen === "match" && <Match />}
      <Manual />
      <ScanToJoin />
      <ChainSetup />
    </Stage>
  );
}
