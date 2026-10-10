"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { A, ATTACKS, type Action, type BoutState, type Side } from "@sublevel/engine";
import { actionInfo, STYLE_STAMP_BG } from "@/lib/describe";
import { SLOW, useGame, useView } from "@/lib/game";
import { actionCardCanvas, cardBackCanvas, canvasTex, chalkRingCanvas, ledgerCanvas } from "./textures";
import { pbr, usePosterTexture } from "./useTex";

/** The table slab, chalk ring, ledger, matchsticks, lock tokens, corner (bench) cards. */
export function TableProps({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => pbr("table", [3.2, 1.3]), []);
  const ring = useMemo(() => canvasTex(chalkRingCanvas()), []);
  const ledger = useMemo(() => canvasTex(ledgerCanvas()), []);
  const view = useView();
  const meta = useGame((s) => s.meta);
  const locked = useGame((s) => s.locked);
  const oppLocked = useGame((s) => s.oppLocked);
  const reveal = useGame((s) => s.reveal);
  const history = useGame((s) => s.history);
  const stage = useGame((s) => s.stage);
  const glow = useRef(0);
  const ledgerMat = useRef<THREE.MeshStandardMaterial>(null);
  const ledgerLight = useRef<THREE.PointLight>(null);
  const lastHist = useRef(0);

  useFrame((_, dt) => {
    if (history.length !== lastHist.current) {
      lastHist.current = history.length;
      glow.current = 1;
    }
    glow.current = Math.max(0, glow.current - dt * 0.9);
    if (ledgerMat.current) ledgerMat.current.emissiveIntensity = glow.current * 1.4;
    if (ledgerLight.current) ledgerLight.current.intensity = glow.current * 12;
  });

  if (!view) return null;
  const showTokens = stage === "waiting" || (stage === "reveal" && reveal?.step === 0);

  return (
    <group>
      {/* slab */}
      <mesh position={[0, -0.15, 0]} receiveShadow castShadow={shadows}>
        <boxGeometry args={[9.4, 0.3, 3.9]} />
        <meshStandardMaterial {...wood} color="#8f7f6a" roughness={1} normalScale={new THREE.Vector2(1.2, 1.2)} />
      </mesh>
      {/* under-table dark */}
      <mesh position={[0, -1.9, 0]}>
        <boxGeometry args={[8.6, 3.2, 3.2]} />
        <meshStandardMaterial color="#0b0a09" roughness={1} />
      </mesh>
      {/* chalk ring decal */}
      <mesh position={[0, 0.006, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.9, 2.6]} />
        <meshBasicMaterial map={ring} transparent depthWrite={false} opacity={0.9} polygonOffset polygonOffsetFactor={-2} />
      </mesh>

      {/* the ledger */}
      <group position={[-3.0, 0.09, 1.3]} rotation={[0, 0.22, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.3, 0.17, 0.9]} />
          <meshStandardMaterial ref={ledgerMat} color="#1c140f" emissive="#7a5cff" emissiveIntensity={0} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.088, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.22, 0.84]} />
          <meshStandardMaterial map={ledger} roughness={0.8} />
        </mesh>
        <pointLight ref={ledgerLight} position={[0, 0.6, 0]} color="#7a5cff" intensity={0} distance={3} decay={2} />
      </group>

      {/* matchsticks = Grit */}
      {([0, 1] as Side[]).map((s) => (
        <MatchRow key={s} side={s} grit={view.sides[s].grit} />
      ))}

      {/* corner (bench) cards, lying on the table */}
      {([0, 1] as Side[]).map((s) =>
        view.sides[s].fighters.map((f, i) =>
          i === view.sides[s].active ? null : <CornerCard key={`${s}${i}`} side={s} idx={i} slot={slotOf(view, s, i)} fighter={f} name={meta.name[s][i] ?? "?"} seed={meta.seed[s][i] ?? i + 1} />,
        ),
      )}

      {/* lock-in tokens */}
      <Token position={[-0.55, 0.03, 1.35]} visible={showTokens && locked !== null} />
      <Token position={[0.55, 0.03, 1.35]} visible={showTokens && oppLocked} glow />
    </group>
  );
}

function slotOf(b: BoutState, side: Side, idx: number) {
  let n = 0;
  for (let i = 0; i < idx; i++) if (i !== b.sides[side].active) n++;
  return n;
}

function Token({ position, visible, glow = false }: { position: [number, number, number]; visible: boolean; glow?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const t0 = useRef(0);
  const was = useRef(false);
  useFrame(() => {
    if (!g.current) return;
    if (visible && !was.current) t0.current = performance.now();
    was.current = visible;
    const k = visible ? Math.min(1, (performance.now() - t0.current) / (280 * SLOW)) : 0;
    const drop = (1 - k) * (1 - k) * 1.4;
    const bounce = k >= 1 ? 0 : Math.abs(Math.sin(k * Math.PI * 1.5)) * 0.05 * (1 - k);
    g.current.position.set(position[0], position[1] + drop + bounce, position[2]);
    g.current.scale.setScalar(visible ? 1 : 0.0001);
  });
  return (
    <group ref={g}>
      <mesh castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.05, 28]} />
        <meshStandardMaterial color={glow ? "#ff5a1f" : "#d04a14"} emissive={glow ? "#ff5a1f" : "#000"} emissiveIntensity={glow ? 1.5 : 0} metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.027, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.14, 24]} />
        <meshStandardMaterial color="#0b0b0c" />
      </mesh>
    </group>
  );
}

function MatchRow({ side, grit }: { side: Side; grit: number }) {
  const x0 = side === 0 ? -3.95 : 2.95;
  const sticks = Array.from({ length: 5 }, (_, i) => i);
  return (
    <group position={[x0, 0.02, 1.62]}>
      {sticks.map((i) => {
        const have = i < grit;
        return (
          <group key={i} position={[i * 0.2, 0, Math.sin(i * 1.7) * 0.03]} rotation={[0, (i - 2) * 0.08, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.014, 0.014, 0.62, 6]} />
              <meshStandardMaterial color={have ? "#c9a96b" : "#1f1b16"} roughness={0.9} />
            </mesh>
            <mesh position={[-0.31, 0, 0]}>
              <sphereGeometry args={[0.032, 12, 12]} />
              <meshStandardMaterial color={have ? "#c1272d" : "#0f0d0b"} emissive={have ? "#ff5a1f" : "#000"} emissiveIntensity={have ? 1.6 : 0} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function CornerCard({ side, idx, slot, fighter, name, seed }: { side: Side; idx: number; slot: number; fighter: BoutState["sides"][0]["fighters"][0]; name: string; seed: number }) {
  const tex = usePosterTexture(fighter, name, seed, 0);
  const back = useMemo(() => canvasTex(cardBackCanvas()), []);
  const known = fighter.build.attackIds[0] >= 0;
  const dir = side === 0 ? 1 : -1;
  const x = side === 0 ? -3.35 + slot * 0.55 : 3.35 - slot * 0.55;
  const z = 0.65 + slot * 0.2;
  void idx;
  return (
    <group position={[x, 0.012 + slot * 0.004, z]} rotation={[-Math.PI / 2 + 0.05, 0, dir * (0.18 + slot * 0.1)]}>
      <mesh castShadow receiveShadow>
        <planeGeometry args={[0.92, 1.3]} />
        <meshStandardMaterial key={tex ? "tex" : "none"} emissive="#ffffff" emissiveIntensity={0.18} emissiveMap={known ? (tex ?? undefined) : back} map={known ? (tex ?? undefined) : back} color={fighter.alive ? "#ffffff" : "#555"} alphaTest={0.5} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The two played actions, flipping up at the centre of the ring. */
export function ActionCards3D() {
  const reveal = useGame((s) => s.reveal);
  const [faces, setFaces] = useState<[THREE.CanvasTexture, THREE.CanvasTexture] | null>(null);
  const back = useMemo(() => canvasTex(cardBackCanvas()), []);
  const groups = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const shown = useRef(false);
  const t0 = useRef(0);
  const flipAt = useRef(-1);

  useEffect(() => {
    if (!reveal) {
      shown.current = false;
      flipAt.current = -1;
      return;
    }
    if (!shown.current) {
      shown.current = true;
      t0.current = performance.now();
      const mk = (side: Side, action: Action) => {
        const info = actionInfo(reveal.before, side, action);
        const f = reveal.before.sides[side].fighters[reveal.before.sides[side].active]!;
        const tpl = info.kind === "attack" ? ATTACKS[f.build.attackIds[action === A.ATTACK1 ? 0 : 1]!] : null;
        return canvasTex(actionCardCanvas({ who: side === 0 ? "YOU" : "THEM", kind: info.cls ? `${info.cls} ATTACK` : info.kind, title: info.title, sub: info.sub, dmg: info.dmg, cost: info.cost, accent: tpl ? (STYLE_STAMP_BG[tpl.style] === "#0b0b0c" ? "#0b0b0c" : STYLE_STAMP_BG[tpl.style]) : "#0b0b0c" }));
      };
      setFaces([mk(0, reveal.actions[0]), mk(1, reveal.actions[1])]);
    }
    if (reveal.step >= 1 && flipAt.current < 0) flipAt.current = performance.now();
  }, [reveal]);

  useFrame(() => {
    for (let s = 0; s < 2; s++) {
      const g = groups[s]!.current;
      if (!g) continue;
      const vis = !!reveal;
      g.visible = vis;
      if (!vis) continue;
      const enter = Math.min(1, (performance.now() - t0.current) / (380 * SLOW));
      const e = 1 - Math.pow(1 - enter, 3);
      const flip = flipAt.current > 0 ? Math.min(1, (performance.now() - flipAt.current) / (520 * SLOW)) : 0;
      const fe = flip * flip * (3 - 2 * flip);
      const x = (s === 0 ? -1 : 1) * 0.74;
      g.position.set(x, 0.55 + (1 - e) * 1.6 + Math.sin(fe * Math.PI) * 0.35, 0.95);
      g.rotation.set(-0.5, Math.PI * (1 - fe) + (s === 0 ? 0.05 : -0.05), (s === 0 ? 0.06 : -0.06));
    }
  });

  return (
    <>
      {[0, 1].map((s) => (
        <group key={s} ref={groups[s]} visible={false}>
          <mesh castShadow>
            <planeGeometry args={[1.0, 1.36]} />
            <meshStandardMaterial key={faces ? "f" : "n"} map={faces?.[s] ?? undefined} color={faces ? "#cfc8b8" : "#444"} alphaTest={0.5} roughness={0.95} side={THREE.FrontSide} />
          </mesh>
          <mesh rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[1.0, 1.36]} />
            <meshStandardMaterial map={back} roughness={0.9} side={THREE.FrontSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}
