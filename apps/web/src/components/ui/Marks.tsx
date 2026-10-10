"use client";

/** HP as tally scratches. Lost marks are scratched out. Groups of five get the diagonal slash. */
export function Tally({ hp, max, size = 1, color = "var(--chalk)", flash = false }: { hp: number; max: number; size?: number; color?: string; flash?: boolean }) {
  if (max <= 0) return <div className="typewriter" style={{ fontSize: 14 * size, opacity: 0.6 }}>HP ???</div>;
  const marks = [];
  for (let i = 0; i < max; i++) {
    const alive = i < hp;
    marks.push(
      <span
        key={i}
        style={{
          display: "inline-block",
          width: 5 * size,
          height: 26 * size,
          marginRight: (i % 5 === 4 ? 12 : 5) * size,
          background: alive ? color : "transparent",
          border: alive ? "none" : `1.5px dashed ${"rgba(245,241,230,0.35)"}`,
          transform: `rotate(${(i % 3) - 1}deg)`,
          borderRadius: 1,
          boxShadow: alive ? (flash ? "0 0 12px var(--tape)" : "0 0 0 rgba(0,0,0,0)") : "none",
          transition: "background 0.25s, box-shadow 0.25s",
        }}
      />,
    );
  }
  return <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", maxWidth: 360 * size }}>{marks}</div>;
}

/** Grit as matchsticks: lit = available; spent = charred. */
export function Matches({ grit, cap = 5, size = 1, preview = 0 }: { grit: number; cap?: number; size?: number; preview?: number }) {
  const sticks = [];
  for (let i = 0; i < cap; i++) {
    const have = i < grit;
    const willSpend = have && i >= grit - preview;
    sticks.push(
      <span key={i} style={{ position: "relative", display: "inline-block", width: 9 * size, height: 44 * size, marginRight: 6 * size, transform: `rotate(${(i - 2) * 3}deg)` }}>
        <span
          style={{
            position: "absolute",
            left: 3 * size,
            top: 10 * size,
            width: 3.6 * size,
            height: 34 * size,
            background: have ? "linear-gradient(#e0c28a,#b0905a)" : "linear-gradient(#3a342c,#1c1914)",
            opacity: have ? 1 : 0.55,
            borderRadius: 2,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 9 * size,
            height: 13 * size,
            borderRadius: "50% 50% 45% 45%",
            background: have ? (willSpend ? "radial-gradient(circle at 40% 30%, #ffd9a0, #ff9a3c 45%, #c1272d)" : "radial-gradient(circle at 40% 30%, #ff9a7a, #c1272d 55%, #6e1015)") : "#16130f",
            boxShadow: have ? (willSpend ? "0 0 14px 3px rgba(255,140,40,0.85)" : "0 0 6px rgba(255,80,40,0.35)") : "none",
          }}
        />
      </span>,
    );
  }
  return <div style={{ display: "flex", alignItems: "flex-end" }}>{sticks}</div>;
}

export function Stamp({ children, color = "var(--tape)", rotate = -6, size = 22, filled = false }: { children: React.ReactNode; color?: string; rotate?: number; size?: number; filled?: boolean }) {
  return (
    <span
      className="stencil"
      style={{
        display: "inline-block",
        padding: `${size * 0.14}px ${size * 0.5}px`,
        border: `${Math.max(2, size * 0.14)}px solid ${filled ? "transparent" : color}`,
        background: filled ? color : "transparent",
        color: filled ? "#0b0b0c" : color,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "0.1em",
        transform: `rotate(${rotate}deg)`,
        borderRadius: 3,
        mixBlendMode: filled ? "normal" : "multiply",
        opacity: 0.94,
      }}
    >
      {children}
    </span>
  );
}

export function Tape({ w = 90, h = 26, rotate = -8, style }: { w?: number; h?: number; rotate?: number; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        position: "absolute",
        width: w,
        height: h,
        background: "linear-gradient(90deg, rgba(228,220,190,0.88), rgba(214,205,170,0.82))",
        boxShadow: "0 2px 4px rgba(0,0,0,0.35)",
        transform: `rotate(${rotate}deg)`,
        clipPath: "polygon(0 8%, 4% 0, 100% 6%, 97% 100%, 3% 94%)",
        ...style,
      }}
    />
  );
}
