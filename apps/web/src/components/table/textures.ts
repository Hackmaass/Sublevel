"use client";

import * as THREE from "three";
import { ATTACKS, STYLE_NAMES, isHeavy, type FighterState } from "@sublevel/engine";
import { portraitDataUrl } from "@/lib/portrait";
import { STYLE_INK, STYLE_STAMP_BG } from "@/lib/describe";

/** Make sure the display fonts are actually available to canvas before drawing. */
export async function ensureFonts() {
  if (typeof document === "undefined") return;
  await Promise.all([
    document.fonts.load('64px "Anton"'),
    document.fonts.load('28px "Special Elite"'),
    document.fonts.load('700 28px "Stardos Stencil"'),
    document.fonts.load('28px "Permanent Marker"'),
    document.fonts.load('600 24px "IBM Plex Mono"'),
  ]);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** torn-paper outline as a canvas path */
function tornPath(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, amp: number) {
  const rnd = mulberry(seed * 977 + 5);
  const n = 28;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) ctx.lineTo((i / n) * w, rnd() * amp);
  for (let i = 1; i <= n; i++) ctx.lineTo(w - rnd() * amp, (i / n) * h);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo((i / n) * w, h - rnd() * amp);
  for (let i = n - 1; i >= 1; i--) ctx.lineTo(rnd() * amp, (i / n) * h);
  ctx.closePath();
}

function paperFill(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#f0ebde");
  g.addColorStop(1, "#d6cfbb");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry(seed + 11);
  // halftone speckle
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) ctx.fillRect(x, y, 2, 2);
  // stains & creases
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(80,60,30,${0.04 + rnd() * 0.06})`;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(rnd() * w, rnd() * h);
    ctx.lineTo(rnd() * w, rnd() * h);
    ctx.stroke();
  }
  const ring = ctx.createRadialGradient(w * 0.75, h * 0.8, 6, w * 0.75, h * 0.8, 70);
  ring.addColorStop(0.8, "rgba(110,80,40,0.0)");
  ring.addColorStop(0.9, "rgba(110,80,40,0.16)");
  ring.addColorStop(1, "rgba(110,80,40,0)");
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, w, h);
}

export interface PosterTexOpts {
  fighter: FighterState;
  name: string;
  seed: number;
  /** career wear 0..n → extra creases/stains */
  wear?: number;
}

export const POSTER_W = 660;
export const POSTER_H = 940;

/** A fighter poster face as a (torn-edged, alpha-cut) canvas. */
export async function posterCanvas({ fighter, name, seed, wear = 0 }: PosterTexOpts): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const c = document.createElement("canvas");
  c.width = POSTER_W;
  c.height = POSTER_H;
  const ctx = c.getContext("2d")!;
  ctx.save();
  tornPath(ctx, POSTER_W, POSTER_H, seed, 9);
  ctx.clip();
  paperFill(ctx, POSTER_W, POSTER_H, seed);

  const known = fighter.build.attackIds[0] >= 0;
  // portrait window
  const px = 30, py = 30, pw = POSTER_W - 60, ph = 600;
  ctx.fillStyle = "#cdc7b3";
  ctx.fillRect(px, py, pw, ph);
  if (known) {
    const img = await loadImage(portraitDataUrl({ seed, style: fighter.build.style, wear }));
    {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.globalCompositeOperation = "multiply";
    // cover
    const s = Math.max(pw / img.width, ph / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) * 0.12, dw, dh);
    ctx.restore();
    }
    // photocopy streaks
    const rnd = mulberry(seed * 31 + 3);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 5; i++) ctx.fillRect(px + rnd() * pw, py, 2 + rnd() * 3, ph);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "#1b1b1d";
    ctx.font = '300px "Anton"';
    ctx.textAlign = "center";
    ctx.fillText("?", POSTER_W / 2, py + ph * 0.75);
  }
  ctx.strokeStyle = "#0b0b0c";
  ctx.lineWidth = 6;
  ctx.strokeRect(px, py, pw, ph);

  // style stamp
  if (known) {
    const style = fighter.build.style;
    ctx.save();
    ctx.translate(POSTER_W - 150, 72);
    ctx.rotate(0.12);
    ctx.fillStyle = STYLE_STAMP_BG[style];
    ctx.fillRect(-92, -30, 184, 60);
    ctx.fillStyle = STYLE_INK[style];
    ctx.font = '700 40px "Stardos Stencil"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(STYLE_NAMES[style], 0, 3);
    ctx.restore();
  }

  // name
  ctx.fillStyle = "#0b0b0c";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = '84px "Anton"';
  let label = known ? name.toUpperCase() : "UNKNOWN";
  while (ctx.measureText(label).width > POSTER_W - 60 && label.length > 3) {
    label = label.slice(0, -1);
  }
  ctx.fillText(label, 32, py + ph + 96);

  // attacks
  if (known) {
    ctx.font = '26px "Special Elite"';
    fighter.build.attackIds.forEach((id, i) => {
      const t = ATTACKS[id]!;
      const y = py + ph + 146 + i * 36;
      ctx.fillStyle = "#1b1b1d";
      ctx.textAlign = "left";
      ctx.fillText(`${t.name}  ${isHeavy(t.cost) ? "HEAVY" : "LIGHT"}`, 36, y);
      ctx.textAlign = "right";
      ctx.fillText(`${t.cost}● → ${t.dmg}`, POSTER_W - 36, y);
    });
  }

  // wear: extra creases and coffee ring from career
  const rw = mulberry(seed * 13 + wear);
  for (let i = 0; i < wear * 2; i++) {
    ctx.strokeStyle = `rgba(30,20,10,${0.1 + rw() * 0.2})`;
    ctx.lineWidth = 2 + rw() * 3;
    ctx.beginPath();
    ctx.moveTo(rw() * POSTER_W, rw() * POSTER_H);
    ctx.lineTo(rw() * POSTER_W, rw() * POSTER_H);
    ctx.stroke();
  }
  ctx.restore();
  // edge darkening
  ctx.save();
  tornPath(ctx, POSTER_W, POSTER_H, seed, 9);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(60,45,25,0.5)";
  ctx.stroke();
  ctx.restore();
  return c;
}

/** the back of a card / cardboard back of a standee */
export function cardBackCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 330;
  c.height = 470;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1a1a1c";
  ctx.fillRect(0, 0, 330, 470);
  ctx.strokeStyle = "#2c2c30";
  ctx.lineWidth = 6;
  for (let i = -470; i < 330; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 470, 470);
    ctx.stroke();
  }
  ctx.strokeStyle = "#0b0b0c";
  ctx.lineWidth = 18;
  ctx.strokeRect(0, 0, 330, 470);
  ctx.fillStyle = "#ff5a1f";
  ctx.font = '170px "Anton"';
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.85;
  ctx.fillText("S", 165, 290);
  return c;
}

/** a played-action card face (reveal) */
export function actionCardCanvas(opts: { who: string; kind: string; title: string; sub: string; dmg?: number; cost: number; accent: string }): HTMLCanvasElement {
  const W = 440, H = 600;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.save();
  tornPath(ctx, W, H, opts.title.length * 7 + opts.cost, 7);
  ctx.clip();
  paperFill(ctx, W, H, opts.title.length * 13 + 5);
  ctx.fillStyle = "#555";
  ctx.font = '700 26px "Stardos Stencil"';
  ctx.textAlign = "left";
  ctx.fillText(`${opts.who} · ${opts.kind.toUpperCase()}`, 28, 52);
  ctx.fillStyle = "#0b0b0c";
  ctx.font = '88px "Anton"';
  let t = opts.title.toUpperCase();
  while (ctx.measureText(t).width > W - 56 && t.length > 3) t = t.slice(0, -1);
  ctx.fillText(t, 26, 150);
  ctx.fillStyle = "#2b2b2d";
  ctx.font = '23px "Special Elite"';
  wrap(ctx, opts.sub, 28, 200, W - 56, 30);
  if (opts.dmg !== undefined) {
    ctx.fillStyle = opts.accent;
    ctx.font = '210px "Anton"';
    ctx.fillText(String(opts.dmg), 24, H - 40);
  }
  ctx.fillStyle = "#1b1b1d";
  ctx.font = '26px "Special Elite"';
  ctx.textAlign = "right";
  ctx.fillText(opts.cost > 0 ? `−${opts.cost} grit` : "free", W - 28, H - 36);
  ctx.restore();
  return c;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

/** rough chalk ring on a transparent canvas (used as an alpha texture on a table decal) */
export function chalkRingCanvas(): HTMLCanvasElement {
  const W = 2048, H = 768;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const rnd = mulberry(77);
  for (let pass = 0; pass < 5; pass++) {
    ctx.strokeStyle = `rgba(245,241,230,${0.5 - pass * 0.07})`;
    ctx.lineWidth = 9 - pass * 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    const n = 220;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rx = W * 0.46 + (rnd() - 0.5) * 7;
      const ry = H * 0.43 + (rnd() - 0.5) * 7;
      const x = W / 2 + Math.cos(a) * rx;
      const y = H / 2 + Math.sin(a) * ry;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // centre line + marks
  ctx.strokeStyle = "rgba(245,241,230,0.45)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(W / 2, H * 0.12);
  ctx.lineTo(W / 2, H * 0.88);
  ctx.stroke();
  // chalk dust
  ctx.fillStyle = "rgba(245,241,230,0.5)";
  for (let i = 0; i < 1800; i++) {
    const a = rnd() * Math.PI * 2;
    ctx.fillRect(W / 2 + Math.cos(a) * W * 0.46 + (rnd() - 0.5) * 30, H / 2 + Math.sin(a) * H * 0.43 + (rnd() - 0.5) * 30, 1.5, 1.5);
  }
  return c;
}

/** chain-link fence alpha pattern */
export function fenceCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(200,200,205,0.9)";
  ctx.lineWidth = 5;
  const step = S / 4;
  for (let i = -4; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + S, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * step + S, 0);
    ctx.lineTo(i * step, S);
    ctx.stroke();
  }
  return c;
}

/** the Ledger book cover */
export function ledgerCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 440;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 640, 440);
  g.addColorStop(0, "#2a1c14");
  g.addColorStop(1, "#14100c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 440);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 640, Math.random() * 440);
    ctx.lineTo(Math.random() * 640, Math.random() * 440);
    ctx.stroke();
  }
  ctx.fillStyle = "#e9e4d8";
  ctx.fillRect(100, 120, 440, 180);
  ctx.fillStyle = "#0b0b0c";
  ctx.font = '84px "Anton"';
  ctx.textAlign = "center";
  ctx.fillText("THE LEDGER", 320, 215);
  ctx.font = '26px "Special Elite"';
  ctx.fillText("every move, written down", 320, 262);
  ctx.strokeStyle = "#7a5cff";
  ctx.lineWidth = 5;
  ctx.strokeRect(112, 132, 416, 156);
  return c;
}

export function canvasTex(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: [number, number] } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...opts.repeat);
  }
  t.needsUpdate = true;
  return t;
}
