"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { canvasTex, fenceCanvas } from "./textures";
import { pbr } from "./useTex";

/** Concrete basement: block wall, worn floor, chain-link, a swinging bulb with light, haze and dust. */
export function Room({ shadows, swayKick }: { shadows: boolean; swayKick: React.MutableRefObject<number> }) {
  const wall = useMemo(() => pbr("wall", [4, 2.4]), []);
  const floor = useMemo(() => pbr("floor", [6, 6]), []);
  const fence = useMemo(() => canvasTex(fenceCanvas(), { repeat: [16, 8] }), []);
  const bulb = useRef<THREE.Group>(null);
  const flick = useRef(1);
  const bulbMat = useRef<THREE.MeshStandardMaterial>(null);
  const spot = useRef<THREE.SpotLight>(null);

  useEffect(() => {
    if (spot.current) {
      spot.current.target.position.set(0, 0, 0.3);
      spot.current.target.updateMatrixWorld();
    }
  }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    swayKick.current *= Math.pow(0.04, dt);
    const sway = 0.045 * Math.sin(t * 0.8) + 0.02 * Math.sin(t * 1.9 + 1) + swayKick.current;
    if (bulb.current) {
      bulb.current.rotation.z = sway;
      bulb.current.rotation.x = 0.015 * Math.sin(t * 0.6);
    }
    // flicker (rare dips)
    const n = Math.sin(t * 13.1) * Math.sin(t * 7.3) * Math.sin(t * 2.1);
    flick.current += ((n > 0.82 ? 0.65 : 1) - flick.current) * Math.min(1, dt * 18);
    if (spot.current) spot.current.intensity = 520 * flick.current;
    if (bulbMat.current) bulbMat.current.emissiveIntensity = 6 * flick.current;
  });

  return (
    <>
      <color attach="background" args={["#060606"]} />
      <fogExp2 attach="fog" args={["#0b0907", 0.045]} />
      <hemisphereLight args={["#9a8870", "#1d1812", 0.55]} />
      <ambientLight intensity={0.12} color="#8a7a66" />
      {/* cold rim from the far left, like a door ajar */}
      <pointLight position={[-7, 2.2, -2]} intensity={46} color="#5a6f96" distance={16} decay={2} />
      <pointLight position={[7, 1.4, -1]} intensity={24} color="#6b5a86" distance={14} decay={2} />

      {/* warm wall wash so the cinder block reads */}
      <pointLight position={[0, 3.2, -2.6]} intensity={38} color="#c79a62" distance={11} decay={2} />
      {/* back wall */}
      <mesh position={[0, 2.6, -5.4]} receiveShadow>
        <planeGeometry args={[26, 11]} />
        <meshStandardMaterial {...wall} color="#8d867a" roughness={1} normalScale={new THREE.Vector2(1.4, 1.4)} />
      </mesh>
      {/* side walls to close the room */}
      <mesh position={[-11, 2.6, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[22, 11]} />
        <meshStandardMaterial {...wall} color="#5d584f" roughness={1} />
      </mesh>
      <mesh position={[11, 2.6, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[22, 11]} />
        <meshStandardMaterial {...wall} color="#5d584f" roughness={1} />
      </mesh>
      {/* floor */}
      <mesh position={[0, -3.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial {...floor} color="#6b6559" roughness={1} />
      </mesh>
      {/* chain-link between us and the wall */}
      <mesh position={[0, 2.4, -3.4]}>
        <planeGeometry args={[22, 9]} />
        <meshStandardMaterial map={fence} transparent alphaTest={0.3} color="#b8b8bd" metalness={0.7} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* swinging bulb (lamp + cable + light) */}
      <group ref={bulb} position={[0, 7.2, 0.3]}>
        <mesh position={[0, -1.8, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 3.6, 6]} />
          <meshStandardMaterial color="#0d0d0e" />
        </mesh>
        <mesh position={[0, -3.75, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.2, 12]} />
          <meshStandardMaterial color="#1a1816" metalness={0.8} roughness={0.4} />
        </mesh>
        <mesh position={[0, -3.98, 0]}>
          <sphereGeometry args={[0.15, 24, 24]} />
          <meshStandardMaterial ref={bulbMat} color="#ffe2a8" emissive="#ffbf66" emissiveIntensity={6} toneMapped={false} />
        </mesh>
        {/* glow sprite */}
        <sprite position={[0, -3.98, 0]} scale={[2.6, 2.6, 1]}>
          <spriteMaterial map={glowTex()} color="#ffbf72" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <spotLight
          ref={spot}
          position={[0, -3.96, 0]}
          angle={0.78}
          penumbra={0.85}
          intensity={520}
          distance={14}
          decay={2}
          color="#ffc47a"
          castShadow={shadows}
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.00035}
          shadow-normalBias={0.02}
          shadow-radius={5}
        />
        {/* faux volumetric cone */}
        <mesh position={[0, -5.9, 0]}>
          <cylinderGeometry args={[0.18, 3.1, 3.9, 40, 1, true]} />
          <meshBasicMaterial color="#ffcf8a" transparent opacity={0.055} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} alphaMap={coneAlpha()} />
        </mesh>
      </group>
      <Dust />
    </>
  );
}

let _glow: THREE.CanvasTexture | null = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,230,180,0.55)");
  r.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
let _cone: THREE.CanvasTexture | null = null;
function coneAlpha() {
  if (_cone) return _cone;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const l = g.createLinearGradient(0, 0, 0, 128);
  l.addColorStop(0, "#ffffff");
  l.addColorStop(0.6, "#777777");
  l.addColorStop(1, "#000000");
  g.fillStyle = l;
  g.fillRect(0, 0, 4, 128);
  _cone = new THREE.CanvasTexture(c);
  return _cone;
}

/** drifting dust motes in the lamp's cone */
function Dust({ count = 260 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, seeds } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const s = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 3.4;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = Math.random() * 4.2 - 0.2;
      p[i * 3 + 2] = Math.sin(a) * r * 0.7 + 0.3;
      s[i * 3] = Math.random() * 6.28;
      s[i * 3 + 1] = 0.05 + Math.random() * 0.12;
      s[i * 3 + 2] = 0.1 + Math.random() * 0.3;
    }
    return { positions: p, seeds: s };
  }, [count]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position!.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const ph = seeds[i * 3]!;
      arr[i * 3] = positions[i * 3]! + Math.sin(t * seeds[i * 3 + 2]! + ph) * 0.25;
      arr[i * 3 + 1] = ((positions[i * 3 + 1]! + t * seeds[i * 3 + 1]!) % 4.4) - 0.2;
      arr[i * 3 + 2] = positions[i * 3 + 2]! + Math.cos(t * seeds[i * 3 + 2]! * 0.8 + ph) * 0.2;
    }
    pts.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.slice(), 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.045} color="#ffe2b0" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}
