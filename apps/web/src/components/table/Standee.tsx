"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FighterState, Side } from "@sublevel/engine";
import { SLOW, useGame } from "@/lib/game";
import { usePosterTexture } from "./useTex";

const W = 1.72;
const H = 2.44;
const SCALE = 0.8;

export interface StandeeProps {
  side: Side;
  fighter: FighterState;
  name: string;
  seed: number;
  home: [number, number, number];
  onImpact: (power: number, side: Side) => void;
}

/** A cardboard standee on the chalk ring: spawns in, lunges, takes hits, falls when KO'd. */
export function Standee({ side, fighter, name, seed, home, onImpact }: StandeeProps) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const tex = usePosterTexture(fighter, name, seed, 0);
  const born = useRef(performance.now());
  const lungeAt = useRef(-1);
  const hitAt = useRef(-1);
  const hitPower = useRef(0);
  const dir = side === 0 ? 1 : -1;
  const alive = useRef(fighter.alive);
  const koAt = useRef(-1);
  alive.current = fighter.alive;

  // react to store events (no re-render needed)
  useEffect(() => {
    let lastStep = -1;
    let maxId = useGame.getState().fx.reduce((m, f) => Math.max(m, f.id), 0);
    const unsub = useGame.subscribe((s) => {
      const step = s.reveal?.step ?? -1;
      if (step === 2 && lastStep !== 2) {
        for (const e of s.reveal!.events) {
          if (e.t === "attack" && e.side === side) lungeAt.current = performance.now();
        }
      }
      lastStep = step;
      // react only to effects we have not seen yet (ids are monotonic; clearing old ones must not re-fire)
      for (const f of s.fx) {
        if (f.id <= maxId) continue;
        maxId = Math.max(maxId, f.id);
        if (f.kind === "hit" && f.side === side && (f.value ?? 0) > 0) {
          hitAt.current = performance.now();
          hitPower.current = Math.min(1.6, 0.5 + (f.value ?? 1) / 5);
          onImpact(hitPower.current, side);
        }
        if (f.kind === "ko" && f.side === side) koAt.current = performance.now();
      }
    });
    return unsub;
  }, [side, onImpact]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();
    const t = clock.getElapsedTime();
    // spawn drop
    const sp = Math.min(1, (now - born.current) / (650 * SLOW));
    const ease = 1 - Math.pow(1 - sp, 3);
    const bounce = sp < 1 ? Math.abs(Math.sin(sp * Math.PI * 2.2)) * (1 - sp) * 0.5 : 0;
    let y = home[1] + (1 - ease) * 2.4 + bounce * 0.4;
    let x = home[0];
    let rz = 0.012 * Math.sin(t * 1.3 + side) * (alive.current ? 1 : 0);
    let rx = 0;

    // lunge
    if (lungeAt.current > 0) {
      const lt = (now - lungeAt.current) / (520 * SLOW);
      if (lt < 1) x += dir * 1.15 * Math.sin(Math.PI * Math.min(1, lt * 1.0)) * (lt < 0.45 ? 1 : 0.9);
    }
    // hit recoil
    let flash = 0;
    if (hitAt.current > 0) {
      const ht = (now - hitAt.current) / (650 * SLOW);
      if (ht < 1) {
        const decay = Math.pow(1 - ht, 2);
        x -= dir * 0.32 * hitPower.current * decay;
        rz -= dir * 0.2 * hitPower.current * decay + Math.sin(ht * 60) * 0.03 * decay;
        flash = decay;
      }
    }
    // KO fall (backwards onto the table)
    if (!alive.current) {
      if (koAt.current < 0) koAt.current = now;
      const kt = Math.min(1, (now - koAt.current) / (900 * SLOW));
      const k = kt * kt * (3 - 2 * kt);
      rx = -k * 1.35; // fall back
      y -= k * 0.0;
      x -= dir * k * 0.25;
    }
    g.position.set(x, y, home[2]);
    g.rotation.set(rx, dir * 0.2, rz);
    g.scale.setScalar(SCALE);
    if (mat.current) {
      const base = alive.current ? 0.34 : 0.1;
      mat.current.emissive.setRGB(base + flash * 1.2, base + flash * 0.55, base + flash * 0.2);
      mat.current.color.setScalar(alive.current ? 1 : 0.38);
    }
  });

  return (
    <group ref={group} position={home}>
      {/* poster face (alpha-cut torn edge) */}
      <mesh position={[0, H / 2 + 0.06, 0]} castShadow receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial key={tex ? "tex" : "none"} ref={mat} map={tex ?? undefined} emissiveMap={tex ?? undefined} color={tex ? "#ffffff" : "#6a6558"} alphaTest={0.5} roughness={0.92} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* cardboard thickness: a darker slab behind the poster */}
      <mesh position={[0, H / 2 + 0.06, -0.018]} castShadow>
        <planeGeometry args={[W - 0.04, H - 0.04]} />
        <meshStandardMaterial color="#5e5240" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* foot */}
      <mesh position={[0, 0.03, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.06, 0.42]} />
        <meshStandardMaterial color="#6e5a3e" roughness={0.9} />
      </mesh>
      {/* prop strut */}
      <mesh position={[0, 0.56, -0.27]} rotation={[0.38, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 1.15, 0.025]} />
        <meshStandardMaterial color="#54472f" roughness={1} />
      </mesh>
      {/* tape on top */}
      <mesh position={[0.1, H + 0.02, 0.012]} rotation={[0, 0, -0.1]}>
        <planeGeometry args={[0.42, 0.13]} />
        <meshStandardMaterial color="#e2d9b5" transparent opacity={0.85} roughness={0.7} />
      </mesh>
      {/* contact shadow blob */}
      <mesh position={[0, 0.006, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.85, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}
