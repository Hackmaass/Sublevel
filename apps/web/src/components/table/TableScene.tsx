"use client";

import { Component, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { Side } from "@sublevel/engine";
import { useGame, useView } from "@/lib/game";
import { Room } from "./Room";
import { Standee } from "./Standee";
import { ActionCards3D, TableProps } from "./Props";
import { ensureFonts } from "./textures";

const HOME: Record<Side, [number, number, number]> = { 0: [-1.85, 0.0, 0.0], 1: [1.85, 0.0, 0.0] };

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  componentDidCatch(e: unknown) {
    console.error("[TableScene] falling back to 2D:", e);
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

export function TableScene({ fallback }: { fallback: ReactNode }) {
  return (
    <Boundary fallback={fallback}>
      <SceneInner />
    </Boundary>
  );
}

function SceneInner() {
  const view = useView();
  const meta = useGame((s) => s.meta);
  const quality = useGame((s) => s.quality);
  const shake = useRef(0);
  const aberr = useRef(0);
  const sway = useRef(0);
  const sparks = useRef<SparksApi>(null);
  const flash = useRef(0);

  useEffect(() => {
    void ensureFonts();
  }, []);

  const onImpact = useCallback((power: number, side: Side) => {
    shake.current = Math.max(shake.current, 0.55 * power);
    aberr.current = Math.max(aberr.current, power);
    sway.current += (side === 0 ? 1 : -1) * 0.05 * power;
    flash.current = 1;
    sparks.current?.burst(side, power);
  }, []);

  if (!view) return null;
  const high = quality === "high";

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows={high}
        dpr={high ? [1, 1.25] : 0.75}
        camera={{ fov: 30, position: [0, 3.7, 8.0], near: 0.1, far: 60 }}
        gl={{ antialias: !high, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
        style={{ position: "absolute", inset: 0 }}
        // The whole UI sits inside a CSS-scaled 1920×1080 stage. Measure the LAYOUT size (offsetWidth/Height), not the scaled bounding box,
        // or the canvas is shrunk twice and the table renders in a corner on every window that isn't exactly 1920×1080.
        resize={{ offsetSize: true, scroll: false }}
      >
        {/* real-GPU safety net: sustained low fps drops to the cheaper tier automatically */}
        <PerformanceMonitor bounds={() => [28, 58]} flipflops={2} onDecline={() => useGame.getState().setQuality("low")} />
        <Room shadows={high} swayKick={sway} />
        <TableProps shadows={high} />
        {([0, 1] as Side[]).map((s) => {
          const sd = view.sides[s];
          const f = sd.fighters[sd.active]!;
          return <Standee key={`${s}-${sd.active}`} side={s} fighter={f} name={meta.name[s][sd.active] ?? "?"} seed={meta.seed[s][sd.active] ?? 1} home={HOME[s]} onImpact={onImpact} />;
        })}
        <ActionCards3D />
        <Sparks ref={sparks} />
        <CameraRig shake={shake} />
        <ImpactLight flash={flash} />
        {high && <Effects aberr={aberr} />}
      </Canvas>
    </div>
  );
}

function CameraRig({ shake }: { shake: React.MutableRefObject<number> }) {
  useFrame(({ camera, pointer, clock }, dt) => {
    const t = clock.getElapsedTime();
    shake.current *= Math.pow(0.002, dt);
    const s = shake.current;
    const g = useGame.getState();
    const step = g.reveal?.step ?? -1;
    const targetFov = step === 1 ? 26.5 : step === 2 ? 28 : 30;
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
    const reduce = g.reduceMotion;
    const px = reduce ? 0 : pointer.x * 0.2;
    const py = reduce ? 0 : pointer.y * 0.07;
    const drift = reduce ? 0 : 1;
    camera.position.set(px + Math.sin(t * 0.4) * 0.04 * drift + (Math.random() - 0.5) * s * 0.35, 3.7 + py + Math.sin(t * 0.55) * 0.03 * drift + (Math.random() - 0.5) * s * 0.25, 8.0);
    camera.lookAt(0, 0.95, 0.25);
  });
  return null;
}

function ImpactLight({ flash }: { flash: React.MutableRefObject<number> }) {
  const l = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    flash.current = Math.max(0, flash.current - dt * 4);
    if (l.current) l.current.intensity = flash.current * 90;
  });
  return <pointLight ref={l} position={[0, 2.4, 2.2]} color="#ffd9a8" intensity={0} distance={9} decay={2} />;
}

function Effects({ aberr }: { aberr: React.MutableRefObject<number> }) {
  const ca = useRef<{ offset: THREE.Vector2 } | null>(null);
  useFrame((_, dt) => {
    aberr.current = Math.max(0, aberr.current - dt * 3.2);
    const a = aberr.current * 0.0075 + 0.0004;
    ca.current?.offset.set(a, a * 0.7);
  });
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.62} luminanceSmoothing={0.3} radius={0.72} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ChromaticAberration ref={ca as any} offset={new THREE.Vector2(0.0004, 0.0003)} radialModulation={false} modulationOffset={0} />
      <Noise opacity={0.07} />
      <Vignette eskil={false} offset={0.22} darkness={0.92} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/* ---------- hit sparks ---------- */
interface SparksApi {
  burst: (side: Side, power: number) => void;
}
import { forwardRef, useImperativeHandle, useMemo } from "react";

const Sparks = forwardRef<SparksApi>(function Sparks(_, ref) {
  const N = 160;
  const pts = useRef<THREE.Points>(null);
  const data = useMemo(() => ({ pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N) }), []);
  useImperativeHandle(ref, () => ({
    burst(side, power) {
      const cx = side === 0 ? -1.85 : 1.85;
      for (let i = 0; i < N; i++) {
        if (data.life[i]! > 0 && i % 2) continue;
        data.pos.set([cx + (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.9, 0.35], i * 3);
        const a = Math.random() * Math.PI * 2;
        const sp = (1.2 + Math.random() * 3.2) * power;
        data.vel.set([Math.cos(a) * sp * 0.9 + (side === 0 ? -1 : 1) * 0.6, Math.abs(Math.sin(a)) * sp * 0.9 + 0.4, (Math.random() - 0.2) * sp * 0.5], i * 3);
        data.life[i] = 0.5 + Math.random() * 0.6;
      }
    },
  }));
  useFrame((_, dt) => {
    const p = pts.current;
    if (!p) return;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      if (data.life[i]! <= 0) {
        data.pos[i * 3 + 1] = -50;
        continue;
      }
      data.life[i]! -= dt;
      data.vel[i * 3 + 1]! -= 7.5 * dt;
      data.pos[i * 3]! += data.vel[i * 3]! * dt;
      data.pos[i * 3 + 1]! += data.vel[i * 3 + 1]! * dt;
      data.pos[i * 3 + 2]! += data.vel[i * 3 + 2]! * dt;
      if (data.pos[i * 3 + 1]! < 0.02) {
        data.pos[i * 3 + 1] = 0.02;
        data.vel[i * 3 + 1]! *= -0.3;
      }
    }
    (attr.array as Float32Array).set(data.pos);
    attr.needsUpdate = true;
  });
  const init = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) a[i * 3 + 1] = -50;
    return a;
  }, []);
  return (
    <points ref={pts} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[init, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} color="#ffb060" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} />
    </points>
  );
});
