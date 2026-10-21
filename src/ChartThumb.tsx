/**
 * A CHART, DRAWN SMALL (release 2): the nine centers, the defined ones in gold.
 *
 * For the returning buyer's "For me" card and the confirm screen -- a picture
 * that says "this one, yours" at a glance. A SIMPLE DRAWING made from the
 * chart's own `definedCenters`, not the engine's bodygraph (which only exists
 * from the chart tier up, and is never committed to this public repo). It is
 * a sign of the chart, not the chart: no gates, no channels.
 */

const SHAPES: Record<string, { kind: "tri-up" | "tri-down" | "square" | "diamond" | "small-tri" | "tri-left" | "tri-right" | "rect"; points?: string; rect?: [number, number, number, number] }> = {
  Head: { kind: "tri-up", points: "50,6 39,21 61,21" },
  Ajna: { kind: "tri-down", points: "39,27 61,27 50,42" },
  Throat: { kind: "square", rect: [41, 48, 18, 16] },
  G: { kind: "diamond", points: "50,68 60,78 50,88 40,78" },
  Heart: { kind: "small-tri", points: "64,76 75,70 73,83" },
  Ego: { kind: "small-tri", points: "64,76 75,70 73,83" },
  Spleen: { kind: "tri-left", points: "14,92 28,84 28,100" },
  "Solar Plexus": { kind: "tri-right", points: "86,92 72,84 72,100" },
  Sacral: { kind: "square", rect: [41, 94, 18, 16] },
  Root: { kind: "rect", rect: [41, 113, 18, 8] },
};

const ORDER = ["Head", "Ajna", "Throat", "G", "Heart", "Spleen", "Solar Plexus", "Sacral", "Root"];

export default function ChartThumb({
  defined = [],
  size = 0,
  label = "The chart, drawn small",
}: {
  defined?: readonly string[];
  /** Width in px. 0 = the card size (84px on a phone, 112px wider). */
  size?: number;
  label?: string;
}) {
  const isOn = (c: string) => defined.includes(c) || (c === "Heart" && defined.includes("Ego"));
  const open = { fill: "rgba(243,239,247,0.07)", stroke: "rgba(180,168,206,0.75)", strokeWidth: 1.2 };
  const def = { fill: "#E8CBA0", stroke: "#E8CBA0", strokeWidth: 1.2 };
  const line = { stroke: "rgba(180,168,206,0.35)", strokeWidth: 1.2, fill: "none" };
  return (
    <div
      className={
        "relative shrink-0 overflow-hidden rounded-2xl border border-brand-gold/30 shadow-lg shadow-brand-gold/10 " +
        (size ? "" : "h-[103px] w-[84px] sm:h-[137px] sm:w-[112px]")
      }
      style={{
        ...(size ? { width: size, height: Math.round(size * 1.22) } : {}),
        background: "radial-gradient(closest-side, rgba(232,203,160,0.18), rgba(11,20,40,0.9))",
      }}
    >
      <svg viewBox="0 0 100 122" className="absolute inset-0 h-full w-full" role="img" aria-label={label}>
        <path d="M50 22 V27 M50 43 V48 M50 64 V68 M50 88 V94 M50 110 V113 M28 92 L40 100 M72 92 L60 100 M60 72 L64 76" {...line} />
        {ORDER.map((c) => {
          const s = SHAPES[c];
          const style = isOn(c) ? def : open;
          if (s.rect) {
            const [x, y, w, h] = s.rect;
            return <rect key={c} x={x} y={y} width={w} height={h} rx={2} {...style} />;
          }
          return <polygon key={c} points={s.points} {...style} />;
        })}
      </svg>
    </div>
  );
}
