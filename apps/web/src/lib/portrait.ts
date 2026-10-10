/**
 * Procedural "photocopied mugshot" generator — original art, no real likenesses.
 * Seeded: the same seed always yields the same face. Output is an SVG string (400x500, transparent bg),
 * posterised + grain-roughened so it reads like a xerox of a harsh-flash photo.
 * The AI portrait pipeline (Booking) will later replace this; this is the gallery/fallback art.
 */
import { mulberry32 } from "@sublevel/engine";

type Rng = () => number;
const r = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
const ri = (rng: Rng, a: number, b: number) => Math.floor(r(rng, a, b + 1));
const pickOf = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const f = (n: number) => n.toFixed(1);

export interface PortraitOpts {
  seed: number;
  /** 0 BRAWL, 1 CLINCH, 2 SLICK — nudges silhouette (wide, stocky, lean) */
  style?: 0 | 1 | 2;
  /** number of scars/bruises to add (career wear) */
  wear?: number;
}

export function portraitSvg({ seed, style = 0, wear = 0 }: PortraitOpts): string {
  const rng = mulberry32(seed * 7919 + 13);
  const skin = ri(rng, 168, 226);
  const skinShade = skin - 52;
  const ink = 18;
  const jawW = style === 0 ? r(rng, 112, 134) : style === 1 ? r(rng, 100, 124) : r(rng, 84, 106);
  const cheekW = jawW + r(rng, 8, 22);
  const headTop = 98 + r(rng, -6, 8);
  const chinY = 348 + r(rng, -6, 12) + (style === 2 ? 6 : 0);
  const cx = 200;
  const eyeY = 214 + r(rng, -6, 6);
  const eyeGap = r(rng, 38, 52);
  const browTilt = r(rng, 5, 15);
  const neckW = style === 0 ? r(rng, 92, 112) : style === 1 ? r(rng, 82, 104) : r(rng, 62, 84);

  const head = `M${cx},${f(headTop)} C${f(cx + cheekW + 10)},${f(headTop)} ${f(cx + cheekW + 4)},${f(headTop + 100)} ${f(cx + cheekW - 2)},${f(headTop + 128)} C${f(cx + cheekW - 6)},${f(chinY - 56)} ${f(cx + jawW * 0.6)},${f(chinY - 8)} ${f(cx + 28)},${f(chinY)} Q${cx},${f(chinY + 10)} ${f(cx - 28)},${f(chinY)} C${f(cx - jawW * 0.6)},${f(chinY - 8)} ${f(cx - cheekW + 6)},${f(chinY - 56)} ${f(cx - cheekW + 2)},${f(headTop + 128)} C${f(cx - cheekW - 4)},${f(headTop + 100)} ${f(cx - cheekW - 10)},${f(headTop)} ${cx},${f(headTop)} Z`;

  /* shoulders / clothing */
  const shoulder = `M${f(cx - 190)},500 L${f(cx - 170)},${f(chinY + 70)} Q${f(cx - 120)},${f(chinY + 38)} ${f(cx - neckW / 2)},${f(chinY - 10)} L${f(cx + neckW / 2)},${f(chinY - 10)} Q${f(cx + 120)},${f(chinY + 38)} ${f(cx + 170)},${f(chinY + 70)} L${f(cx + 190)},500 Z`;
  const garment = pickOf(rng, ["tank", "jacket", "tee", "hoodie"] as const);
  const garmentColor = pickOf(rng, [48, 70, 92, 34]);
  let garmentDetail = "";
  if (garment === "jacket") {
    garmentDetail = `<path d="M${cx},${f(chinY + 6)} L${f(cx - 46)},${f(chinY + 120)} L${f(cx - 8)},500 L${f(cx + 8)},500 L${f(cx + 46)},${f(chinY + 120)} Z" fill="rgb(${skin - 14},${skin - 14},${skin - 14})"/>
      <path d="M${f(cx - 50)},${f(chinY + 10)} L${f(cx - 14)},${f(chinY + 70)} L${f(cx - 54)},${f(chinY + 74)} Z M${f(cx + 50)},${f(chinY + 10)} L${f(cx + 14)},${f(chinY + 70)} L${f(cx + 54)},${f(chinY + 74)} Z" fill="rgb(${garmentColor + 28},${garmentColor + 28},${garmentColor + 28})"/>`;
  } else if (garment === "hoodie") {
    garmentDetail = `<path d="M${f(cx - 70)},${f(chinY - 4)} Q${cx},${f(chinY + 54)} ${f(cx + 70)},${f(chinY - 4)} L${f(cx + 90)},${f(chinY + 60)} Q${cx},${f(chinY + 100)} ${f(cx - 90)},${f(chinY + 60)} Z" fill="rgb(${garmentColor + 20},${garmentColor + 20},${garmentColor + 20})"/>
      <rect x="${f(cx - 4)}" y="${f(chinY + 50)}" width="3" height="70" fill="#d8d3c4"/><rect x="${f(cx + 5)}" y="${f(chinY + 50)}" width="3" height="60" fill="#d8d3c4"/>`;
  } else if (garment === "tank") {
    garmentDetail = `<path d="M${f(cx - neckW / 2 - 6)},${f(chinY - 6)} Q${cx},${f(chinY + 86)} ${f(cx + neckW / 2 + 6)},${f(chinY - 6)} L${f(cx + 150)},${f(chinY + 66)} L${f(cx + 120)},500 L${f(cx - 120)},500 L${f(cx - 150)},${f(chinY + 66)} Z" fill="rgb(${skin - 6},${skin - 6},${skin - 6})"/>
      <path d="M${f(cx - 44)},${f(chinY + 14)} Q${cx},${f(chinY + 74)} ${f(cx + 44)},${f(chinY + 14)}" stroke="rgb(${garmentColor},${garmentColor},${garmentColor})" stroke-width="14" fill="none"/>`;
  } else {
    garmentDetail = `<path d="M${f(cx - 50)},${f(chinY - 2)} Q${cx},${f(chinY + 42)} ${f(cx + 50)},${f(chinY - 2)}" stroke="rgb(${garmentColor - 16},${garmentColor - 16},${garmentColor - 16})" stroke-width="12" fill="none"/>`;
  }

  /* ears */
  const earH = r(rng, 40, 56);
  const ears = [-1, 1]
    .map((s) => `<ellipse cx="${f(cx + s * (cheekW + 2))}" cy="${f(eyeY + 20)}" rx="${f(r(rng, 10, 15))}" ry="${f(earH / 2)}" fill="rgb(${skin - 8},${skin - 8},${skin - 8})"/>`)
    .join("");

  /* hair / hat */
  const hairKind = pickOf(rng, ["bald", "buzz", "slick", "mohawk", "beanie", "cap", "curls", "long"] as const);
  const hairC = ri(rng, 14, 60);
  let hair = "";
  switch (hairKind) {
    case "buzz":
      hair = `<path d="M${f(cx - cheekW + 4)},${f(headTop + 86)} C${f(cx - cheekW)},${f(headTop - 12)} ${f(cx + cheekW)},${f(headTop - 12)} ${f(cx + cheekW - 4)},${f(headTop + 86)} C${f(cx + cheekW - 20)},${f(headTop + 40)} ${f(cx - cheekW + 20)},${f(headTop + 40)} ${f(cx - cheekW + 4)},${f(headTop + 86)} Z" fill="rgb(${hairC},${hairC},${hairC})" opacity="0.85"/>`;
      break;
    case "slick":
      hair = `<path d="M${f(cx - cheekW - 4)},${f(headTop + 92)} C${f(cx - cheekW - 12)},${f(headTop - 26)} ${f(cx + cheekW + 12)},${f(headTop - 26)} ${f(cx + cheekW + 4)},${f(headTop + 92)} C${f(cx + cheekW - 30)},${f(headTop + 30)} ${f(cx - 20)},${f(headTop + 16)} ${f(cx - cheekW - 4)},${f(headTop + 92)} Z" fill="rgb(${hairC},${hairC},${hairC})"/>`;
      break;
    case "mohawk":
      hair = `<path d="M${f(cx - 26)},${f(headTop + 24)} L${f(cx - 18)},${f(headTop - 44)} L${f(cx - 6)},${f(headTop - 18)} L${f(cx + 4)},${f(headTop - 58)} L${f(cx + 14)},${f(headTop - 16)} L${f(cx + 24)},${f(headTop - 40)} L${f(cx + 30)},${f(headTop + 26)} Z" fill="rgb(${hairC},${hairC},${hairC})"/>`;
      break;
    case "beanie":
      hair = `<path d="M${f(cx - cheekW - 10)},${f(headTop + 78)} C${f(cx - cheekW - 12)},${f(headTop - 44)} ${f(cx + cheekW + 12)},${f(headTop - 44)} ${f(cx + cheekW + 10)},${f(headTop + 78)} Z" fill="rgb(${hairC + 30},${hairC + 30},${hairC + 30})"/><rect x="${f(cx - cheekW - 12)}" y="${f(headTop + 58)}" width="${f(cheekW * 2 + 24)}" height="26" rx="6" fill="rgb(${hairC + 10},${hairC + 10},${hairC + 10})"/>`;
      break;
    case "cap":
      hair = `<path d="M${f(cx - cheekW - 8)},${f(headTop + 70)} C${f(cx - cheekW - 8)},${f(headTop - 34)} ${f(cx + cheekW + 8)},${f(headTop - 34)} ${f(cx + cheekW + 8)},${f(headTop + 70)} Z" fill="rgb(${hairC + 24},${hairC + 24},${hairC + 24})"/><path d="M${f(cx - cheekW - 8)},${f(headTop + 66)} L${f(cx + cheekW + 54)},${f(headTop + 76)} L${f(cx + cheekW + 8)},${f(headTop + 84)} L${f(cx - cheekW - 8)},${f(headTop + 80)} Z" fill="rgb(${hairC},${hairC},${hairC})"/>`;
      break;
    case "curls": {
      let c = "";
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + (i / 15) * Math.PI;
        c += `<circle cx="${f(cx + Math.cos(a) * (cheekW + 6))}" cy="${f(headTop + 64 + Math.sin(a) * 78)}" r="${f(r(rng, 18, 28))}" fill="rgb(${hairC},${hairC},${hairC})"/>`;
      }
      hair = c;
      break;
    }
    case "long":
      hair = `<path d="M${f(cx - cheekW - 10)},${f(headTop + 70)} C${f(cx - cheekW - 24)},${f(headTop - 40)} ${f(cx + cheekW + 24)},${f(headTop - 40)} ${f(cx + cheekW + 10)},${f(headTop + 70)} L${f(cx + cheekW + 20)},${f(chinY + 40)} L${f(cx + cheekW - 14)},${f(chinY - 10)} L${f(cx + cheekW - 6)},${f(headTop + 60)} C${f(cx + 40)},${f(headTop + 18)} ${f(cx - 40)},${f(headTop + 18)} ${f(cx - cheekW + 6)},${f(headTop + 60)} L${f(cx - cheekW + 14)},${f(chinY - 10)} L${f(cx - cheekW - 20)},${f(chinY + 40)} Z" fill="rgb(${hairC},${hairC},${hairC})"/>`;
      break;
    default:
      break;
  }

  /* brows, eyes, nose, mouth */
  const browW = r(rng, 34, 46);
  const browThick = r(rng, 7, 13);
  const brows = [-1, 1]
    .map((s) => {
      const ex = cx + s * eyeGap;
      return `<path d="M${f(ex - s * browW * 0.55)},${f(eyeY - 24 - s * 0 + browTilt * 0.2)} L${f(ex + s * browW * 0.55)},${f(eyeY - 30 - browTilt)}" stroke="rgb(${ink},${ink},${ink})" stroke-width="${f(browThick)}" stroke-linecap="square" transform="translate(0,0)"/>`;
    })
    .join("")
    .replace(/<path/g, "<path ");
  const eyeKind = pickOf(rng, ["slit", "round", "heavy"] as const);
  const eyes = [-1, 1]
    .map((s) => {
      const ex = cx + s * eyeGap;
      const w = eyeKind === "round" ? 15 : 20;
      const h = eyeKind === "slit" ? 4 : eyeKind === "round" ? 11 : 7;
      return `<ellipse cx="${f(ex)}" cy="${f(eyeY)}" rx="${w}" ry="${h}" fill="#e8e4d8"/><circle cx="${f(ex + s * -1)}" cy="${f(eyeY + 1)}" r="${f(Math.min(h, 6.5))}" fill="rgb(${ink},${ink},${ink})"/>
        <path d="M${f(ex - w - 3)},${f(eyeY - h * 0.2)} Q${f(ex)},${f(eyeY - h - (eyeKind === "heavy" ? 2 : 6))} ${f(ex + w + 3)},${f(eyeY - h * 0.2)}" stroke="rgb(${ink},${ink},${ink})" stroke-width="${eyeKind === "heavy" ? 9 : 4}" fill="none"/>
        <path d="M${f(ex - w)},${f(eyeY + h + 5)} Q${f(ex)},${f(eyeY + h + 12)} ${f(ex + w)},${f(eyeY + h + 5)}" stroke="rgb(${skinShade},${skinShade},${skinShade})" stroke-width="5" fill="none" opacity="0.7"/>`;
    })
    .join("");
  const noseLen = r(rng, 44, 66);
  const noseW = r(rng, 20, 32);
  const nose = `<path d="M${f(cx - 4)},${f(eyeY + 6)} L${f(cx - 12)},${f(eyeY + noseLen)} Q${f(cx - noseW)},${f(eyeY + noseLen + 8)} ${f(cx - noseW + 6)},${f(eyeY + noseLen + 14)} Q${cx},${f(eyeY + noseLen + 20)} ${f(cx + noseW - 6)},${f(eyeY + noseLen + 14)} Q${f(cx + noseW)},${f(eyeY + noseLen + 8)} ${f(cx + 12)},${f(eyeY + noseLen)}" stroke="rgb(${skinShade - 18},${skinShade - 18},${skinShade - 18})" stroke-width="6" fill="rgb(${skinShade + 24},${skinShade + 24},${skinShade + 24})" stroke-linejoin="round" opacity="0.9"/>`;
  const mouthY = eyeY + noseLen + 46 + r(rng, -4, 8);
  const mouthKind = pickOf(rng, ["flat", "scowl", "smirk"] as const);
  const mouthW = r(rng, 34, 50);
  const mouth =
    mouthKind === "flat"
      ? `<path d="M${f(cx - mouthW)},${f(mouthY)} L${f(cx + mouthW)},${f(mouthY)}" stroke="rgb(${ink},${ink},${ink})" stroke-width="7" stroke-linecap="round"/>`
      : mouthKind === "scowl"
        ? `<path d="M${f(cx - mouthW)},${f(mouthY + 10)} Q${cx},${f(mouthY - 8)} ${f(cx + mouthW)},${f(mouthY + 10)}" stroke="rgb(${ink},${ink},${ink})" stroke-width="7" fill="none" stroke-linecap="round"/>`
        : `<path d="M${f(cx - mouthW)},${f(mouthY + 4)} Q${f(cx + 6)},${f(mouthY + 8)} ${f(cx + mouthW)},${f(mouthY - 8)}" stroke="rgb(${ink},${ink},${ink})" stroke-width="7" fill="none" stroke-linecap="round"/>`;

  /* stubble / jaw shadow */
  const stubble = rng() > 0.45 ? `<path d="${head}" fill="url(#stub)" clip-path="url(#headClip)" opacity="${f(r(rng, 0.35, 0.6))}"/>` : "";

  /* scars & bruises (career wear) */
  let marks = "";
  const nMarks = Math.min(6, ri(rng, 0, 1) + wear);
  for (let i = 0; i < nMarks; i++) {
    const mx = cx + r(rng, -cheekW + 20, cheekW - 20);
    const my = r(rng, headTop + 70, chinY - 40);
    if (rng() > 0.4) {
      marks += `<path d="M${f(mx)},${f(my)} l${f(r(rng, 14, 30))},${f(r(rng, 8, 26))}" stroke="rgb(${ink},${ink},${ink})" stroke-width="3.5" stroke-linecap="round"/><path d="M${f(mx + 6)},${f(my - 5)} l4,12 M${f(mx + 14)},${f(my + 1)} l4,12 M${f(mx + 22)},${f(my + 7)} l4,12" stroke="rgb(${ink},${ink},${ink})" stroke-width="2.4"/>`;
    } else {
      marks += `<ellipse cx="${f(mx)}" cy="${f(my)}" rx="${f(r(rng, 12, 20))}" ry="${f(r(rng, 8, 14))}" fill="rgb(${skinShade - 30},${skinShade - 30},${skinShade - 30})" opacity="0.55"/>`;
    }
  }
  const tape = rng() > 0.8 ? `<rect x="${f(cx + 30)}" y="${f(eyeY - 62)}" width="48" height="18" fill="#d9d3bd" opacity="0.9" transform="rotate(-8 ${cx} ${eyeY})"/>` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
  <defs>
    <clipPath id="headClip"><path d="${head}"/></clipPath>
    <pattern id="stub" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.9" fill="#111"/><circle cx="4" cy="4" r="0.9" fill="#111"/></pattern>
    <linearGradient id="lit" x1="0.85" y1="0.1" x2="0.05" y2="0.95">
      <stop offset="0" stop-color="rgb(${skin + 22},${skin + 22},${skin + 22})"/>
      <stop offset="0.55" stop-color="rgb(${skin},${skin},${skin})"/>
      <stop offset="1" stop-color="rgb(${skinShade},${skinShade},${skinShade})"/>
    </linearGradient>
    <filter id="xerox" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 97}" result="n"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" result="g"/>
      <feComposite in="g" in2="n" operator="arithmetic" k1="0" k2="1" k3="0.22" k4="-0.11" result="grain"/>
      <feComponentTransfer in="grain">
        <feFuncR type="discrete" tableValues="0.06 0.06 0.26 0.46 0.7 0.9 0.96"/>
        <feFuncG type="discrete" tableValues="0.06 0.06 0.26 0.46 0.7 0.9 0.96"/>
        <feFuncB type="discrete" tableValues="0.06 0.06 0.26 0.46 0.7 0.9 0.96"/>
      </feComponentTransfer>
      <feComposite in2="SourceAlpha" operator="in"/>
    </filter>
  </defs>
  <g filter="url(#xerox)">
    <path d="${shoulder}" fill="rgb(${garmentColor},${garmentColor},${garmentColor})"/>
    ${garmentDetail}
    <rect x="${f(cx - neckW / 2)}" y="${f(chinY - 60)}" width="${f(neckW)}" height="${f(86)}" fill="rgb(${skinShade + 10},${skinShade + 10},${skinShade + 10})"/>
    ${ears}
    <path d="${head}" fill="url(#lit)" stroke="rgb(${ink},${ink},${ink})" stroke-width="6" stroke-linejoin="round"/>
    ${stubble}
    ${hair}
    ${brows}
    ${eyes}
    ${nose}
    ${mouth}
    ${marks}
    ${tape}
  </g>
</svg>`;
  return svg;
}

export const portraitDataUrl = (o: PortraitOpts): string => "data:image/svg+xml;utf8," + encodeURIComponent(portraitSvg(o));
