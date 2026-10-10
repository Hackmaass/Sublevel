"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { FighterState } from "@sublevel/engine";
import { canvasTex, posterCanvas } from "./textures";

const cache = new Map<string, THREE.CanvasTexture>();

/** Poster texture for a fighter (cached by build/name/seed/wear). null until ready. */
export function usePosterTexture(fighter: FighterState | undefined, name: string, seed: number, wear = 0): THREE.CanvasTexture | null {
  const key = fighter ? `${seed}|${name}|${fighter.build.style}|${fighter.build.attackIds.join(",")}|${fighter.build.spread}|${wear}` : "";
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(() => (key ? (cache.get(key) ?? null) : null));
  useEffect(() => {
    if (!fighter || !key) return;
    const hit = cache.get(key);
    if (hit) {
      setTex(hit);
      return;
    }
    let alive = true;
    posterCanvas({ fighter, name, seed, wear })
      .then((c) => {
        const t = canvasTex(c);
        cache.set(key, t);
        if (alive) setTex(t);
      })
      .catch((e) => console.error("[poster texture failed]", key, e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tex;
}

/** Load a repeating PBR texture set from /tex. */
export function pbr(base: string, repeat: [number, number]) {
  const loader = new THREE.TextureLoader();
  const set = (t: THREE.Texture, srgb: boolean) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  return {
    map: set(loader.load(`/tex/${base}_diff.jpg`), true),
    normalMap: set(loader.load(`/tex/${base}_nor.jpg`), false),
    roughnessMap: set(loader.load(`/tex/${base}_rough.jpg`), false),
  };
}
