import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import {
  ArrowLeft,
  Box,
  Building2,
  Candy,
  Circle,
  CircleDot,
  Cookie,
  Diamond,
  Gift,
  Heart,
  LockKeyhole,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type PrizeDef = {
  label: string;
  value: string;
  count: number;
  startColor: string;
  endColor: string;
  chipStart: string;
  chipEnd: string;
  textColor: string;
};

type PrizeColorOverride = {
  startColor: string;
  endColor: string;
  textColor: string;
};

type PrizeColorOverrides = Record<string, PrizeColorOverride>;

type PrizeIconKey =
  | "candy"
  | "cookie"
  | "sparkles"
  | "package"
  | "gift"
  | "circle"
  | "star"
  | "heart"
  | "diamond"
  | "box"
  | "dot";

type IconOverrides = Record<string, PrizeIconKey>;

type ClaimRecord = {
  name: string;
  company: string;
  prize: string;
  stubNumber: string;
  claimedAt: string;
  repeat?: boolean;
  isAdminChange?: boolean;
  details?: string[];
};

type AppState = {
  inventory: string[];
  claims: Record<string, ClaimRecord>;
  history: ClaimRecord[];
  lastStubNumber: number;
  colorOverrides: PrizeColorOverrides;
  iconOverrides: IconOverrides;
  wheelTextSize: number;
};

type WheelSegment = PrizeDef & {
  remaining: number;
  startAngle: number;
  endAngle: number;
  sweep: number;
  midAngle: number;
  isDepleted: boolean;
};

type PendingAdminAction =
  | null
  | {
      kind: "apply-inventory" | "reset-inventory";
      details: string[];
      nextCounts: Record<string, number>;
    };

type BackupModalState =
  | null
  | {
      filename: string;
      content: string;
    };

const STORAGE_KEY = "scrc-giveaway-raffle-v22";
const ADMIN_PASSWORD = "SCRC2026";
const ADMIN_ACTOR = "SCRC Admin";

const PRIZES: PrizeDef[] = [
  {
    label: "Hershey's Bar",
    value: "Hershey's Bar",
    count: 10,
    startColor: "#5C3A21",
    endColor: "#8B5E3C",
    chipStart: "#f1e1d2",
    chipEnd: "#e6ccb2",
    textColor: "#4b2e19",
  },
  {
    label: "Hershey's Kisses",
    value: "Hershey's Kisses",
    count: 15,
    startColor: "#2563eb",
    endColor: "#60a5fa",
    chipStart: "#dbeafe",
    chipEnd: "#bfdbfe",
    textColor: "#1d4ed8",
  },
  {
    label: "Peppero Red",
    value: "Peppero Red",
    count: 5,
    startColor: "#ec4899",
    endColor: "#f43f5e",
    chipStart: "#fce7f3",
    chipEnd: "#ffe4e6",
    textColor: "#be185d",
  },
  {
    label: "Peppero Green",
    value: "Peppero Green",
    count: 2,
    startColor: "#16a34a",
    endColor: "#84cc16",
    chipStart: "#dcfce7",
    chipEnd: "#d9f99d",
    textColor: "#166534",
  },
  {
    label: "Peppero White",
    value: "Peppero White",
    count: 3,
    startColor: "#f8fafc",
    endColor: "#cbd5e1",
    chipStart: "#ffffff",
    chipEnd: "#e2e8f0",
    textColor: "#475569",
  },
  {
    label: "Peppero Yellow",
    value: "Peppero Yellow",
    count: 10,
    startColor: "#fde047",
    endColor: "#fff7cc",
    chipStart: "#fef9c3",
    chipEnd: "#ffffff",
    textColor: "#854d0e",
  },
  {
    label: "Candies",
    value: "Candies",
    count: 200,
    startColor: "#f97316",
    endColor: "#fb923c",
    chipStart: "#ffedd5",
    chipEnd: "#fdba74",
    textColor: "#c2410c",
  },
];

const FEATURED_PRIZES = PRIZES.filter((p) => p.value !== "Candies");
const PREMIUM_PRIZES = new Set(FEATURED_PRIZES.map((p) => p.value));
const PRIZE_MAP = Object.fromEntries(PRIZES.map((p) => [p.value, p])) as Record<string, PrizeDef>;
const DEFAULT_INVENTORY = PRIZES.flatMap((p) => Array.from({ length: p.count }, () => p.value));
const DEFAULT_ICON_OVERRIDES: IconOverrides = {
  "Hershey's Bar": "cookie",
  "Hershey's Kisses": "sparkles",
  "Peppero Red": "heart",
  "Peppero Green": "dot",
  "Peppero White": "diamond",
  "Peppero Yellow": "star",
  Candies: "candy",
};

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function inventoryFromCounts(counts: Record<string, number>): string[] {
  return shuffle(
    PRIZES.flatMap((prize) =>
      Array.from({ length: Math.max(0, counts[prize.value] || 0) }, () => prize.value)
    )
  );
}

function countsFromInventory(inventory: string[]): Record<string, number> {
  const base = Object.fromEntries(PRIZES.map((p) => [p.value, 0])) as Record<string, number>;
  inventory.forEach((item) => {
    if (item in base) base[item] += 1;
  });
  return base;
}

function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function makeClaimKey(name: string, company: string): string {
  return `${normalizeValue(name).toUpperCase()}|${normalizeValue(company).toUpperCase()}`;
}

function prettyStubNumber(n: number): string {
  return `SCRC-${String(n).padStart(5, "0")}`;
}

function getPrizeMeta(prize: string, overrides: PrizeColorOverrides = {}): PrizeDef {
  const base = PRIZE_MAP[prize] ?? PRIZE_MAP.Candies;
  const override = overrides[prize];
  return override ? { ...base, ...override } : base;
}

function sanitizeImportedState(parsed: unknown): AppState | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = parsed as Partial<AppState>;
  if (!Array.isArray(data.inventory) || !data.claims || !Array.isArray(data.history)) return null;

  return {
    inventory: data.inventory.filter((item): item is string => typeof item === "string"),
    claims: typeof data.claims === "object" ? (data.claims as Record<string, ClaimRecord>) : {},
    history: data.history.filter((item): item is ClaimRecord => !!item && typeof item === "object"),
    lastStubNumber: typeof data.lastStubNumber === "number" ? data.lastStubNumber : 1000,
    colorOverrides:
      data.colorOverrides && typeof data.colorOverrides === "object"
        ? (data.colorOverrides as PrizeColorOverrides)
        : {},
    iconOverrides:
      data.iconOverrides && typeof data.iconOverrides === "object"
        ? { ...DEFAULT_ICON_OVERRIDES, ...data.iconOverrides }
        : { ...DEFAULT_ICON_OVERRIDES },
    wheelTextSize: typeof data.wheelTextSize === "number" ? data.wheelTextSize : 14,
  };
}

function makeDefaultState(): AppState {
  return {
    inventory: shuffle(DEFAULT_INVENTORY),
    claims: {},
    history: [],
    lastStubNumber: 1000,
    colorOverrides: {},
    iconOverrides: { ...DEFAULT_ICON_OVERRIDES },
    wheelTextSize: 14,
  };
}

function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultState();
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeImportedState(parsed);
    return sanitized ?? makeDefaultState();
  } catch {
    return makeDefaultState();
  }
}

function saveState(state: AppState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildEqualSegments(inventory: string[], overrides: PrizeColorOverrides): WheelSegment[] {
  const counts = inventory.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});

  const sweep = 360 / PRIZES.length;
  let cursor = -90;

  return PRIZES.map((item) => {
    const meta = getPrizeMeta(item.value, overrides);
    const remaining = counts[item.value] || 0;
    const segment: WheelSegment = {
      ...meta,
      remaining,
      startAngle: cursor,
      endAngle: cursor + sweep,
      sweep,
      midAngle: cursor + sweep / 2,
      isDepleted: remaining <= 0,
    };
    cursor += sweep;
    return segment;
  });
}

function polarPoint(angleDeg: number, radiusPct: number): { x: number; y: number } {
  const rad = (Math.PI * angleDeg) / 180;
  return { x: 50 + radiusPct * Math.cos(rad), y: 50 + radiusPct * Math.sin(rad) };
}

function segmentPolygon(startAngle: number, endAngle: number, radiusPct = 50, steps = 24): string {
  const points: string[] = ["50% 50%"];
  const span = endAngle - startAngle;
  const count = Math.max(2, Math.ceil((Math.abs(span) / 360) * steps));
  for (let i = 0; i <= count; i += 1) {
    const angle = startAngle + (span * i) / count;
    const p = polarPoint(angle, radiusPct);
    points.push(`${p.x}% ${p.y}%`);
  }
  return `polygon(${points.join(", ")})`;
}

function labelLines(label: string): string[] {
  switch (label) {
    case "Hershey's Bar":
      return ["Hershey's", "Bar"];
    case "Hershey's Kisses":
      return ["Hershey's", "Kisses"];
    case "Peppero Red":
      return ["Peppero", "Red"];
    case "Peppero Green":
      return ["Peppero", "Green"];
    case "Peppero White":
      return ["Peppero", "White"];
    case "Peppero Yellow":
      return ["Peppero", "Yellow"];
    default:
      return ["Candies"];
  }
}

function runSanityChecks(): void {
  console.assert(DEFAULT_INVENTORY.length === 245, `Expected 245 total items, got ${DEFAULT_INVENTORY.length}`);
  console.assert(countsFromInventory(DEFAULT_INVENTORY).Candies === 200, "Default candies should be 200");
  console.assert(DEFAULT_ICON_OVERRIDES["Peppero Red"] === "heart", "Peppero Red default icon should be heart");
  console.assert(DEFAULT_ICON_OVERRIDES["Peppero Green"] === "dot", "Peppero Green default icon should be dot");
  const segments = buildEqualSegments(["Hershey's Bar", "Candies"], {});
  console.assert(segments.length === 7, "Wheel should have 7 equal slices");
  console.assert(Math.abs(segments.reduce((sum, seg) => sum + seg.sweep, 0) - 360) < 0.0001, "Sweep sum should be 360");
}

function gradientStyle(startColor: string, endColor: string, opacity = 1): React.CSSProperties {
  return { backgroundImage: `linear-gradient(135deg, ${startColor}, ${endColor})`, opacity };
}

function renderPrizeIcon(iconKey: PrizeIconKey, className: string) {
  switch (iconKey) {
    case "candy":
      return <Candy className={className} />;
    case "cookie":
      return <Cookie className={className} />;
    case "sparkles":
      return <Sparkles className={className} />;
    case "package":
      return <Package className={className} />;
    case "gift":
      return <Gift className={className} />;
    case "circle":
      return <Circle className={className} />;
    case "star":
      return <Star className={className} />;
    case "heart":
      return <Heart className={className} />;
    case "diamond":
      return <Diamond className={className} />;
    case "box":
      return <Box className={className} />;
    case "dot":
      return <CircleDot className={className} />;
    default:
      return <Gift className={className} />;
  }
}

function PrizeIllustration({
  prize,
  overrides,
  iconOverrides,
}: {
  prize: string;
  overrides: PrizeColorOverrides;
  iconOverrides: IconOverrides;
}) {
  const meta = getPrizeMeta(prize, overrides);
  const iconKey = iconOverrides[prize] ?? DEFAULT_ICON_OVERRIDES[prize] ?? "gift";
  return (
    <div className="relative flex h-24 w-24 items-center justify-center rounded-full shadow-inner md:h-28 md:w-28" style={gradientStyle(meta.chipStart, meta.chipEnd)}>
      <div className="absolute inset-3 rounded-full border border-white/70" />
      {renderPrizeIcon(iconKey, "h-10 w-10 md:h-12 md:w-12")}
    </div>
  );
}

/** Offset from wheel center toward rim; tuned for the original 560px wheel (216/560 ≈ 0.386). */
const SEGMENT_LABEL_OFFSET_CQW = 38.57;

function SegmentLabel({ segment, wheelTextSize }: { segment: WheelSegment; wheelTextSize: number }) {
  return (
    <div className="absolute left-1/2 top-1/2 z-10" style={{ transform: `translate(-50%, -50%) rotate(${segment.midAngle + 90}deg)` }}>
      <div
        className="flex max-w-[min(9.125rem,26cqw)] items-center justify-center text-center font-black uppercase tracking-[0.05em]"
        style={{
          transform: `translateY(calc(-1 * ${SEGMENT_LABEL_OFFSET_CQW} * 1cqw))`,
          minHeight: "min(4.25rem, 12cqw)",
          lineHeight: 1.03,
          color: segment.textColor,
          textShadow: segment.value === "Hershey's Bar" ? "0 1px 0 rgba(255,255,255,0.12)" : "0 1px 0 rgba(255,255,255,0.45)",
          opacity: segment.isDepleted ? 0.35 : 1,
        }}
      >
        <div className="space-y-0.5">
          {labelLines(segment.label).map((line) => (
            <div
              key={`${segment.value}-${line}`}
              style={{ fontSize: `clamp(9px, 2.75cqw, ${wheelTextSize}px)` }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfettiBurst({ show }: { show: boolean }) {
  if (!show) return null;
  const pieces = Array.from({ length: 24 }, (_, i) => i);
  const colors = ["#f97316", "#fde047", "#60a5fa", "#ec4899", "#16a34a", "#ffffff"];
  return (
    <div className="pointer-events-none absolute inset-0 z-60 overflow-hidden">
      {pieces.map((i) => {
        const left = 8 + ((i * 83) % 84);
        const delay = (i % 8) * 0.05;
        const duration = 1.6 + (i % 5) * 0.15;
        const rotate = (i * 37) % 360;
        return (
          <motion.div
            key={i}
            initial={{ y: -40, opacity: 0, x: 0, rotate }}
            animate={{ y: 640, opacity: [0, 1, 1, 0], x: [0, (i % 2 === 0 ? 1 : -1) * (30 + (i % 7) * 8), 0], rotate: rotate + 360 }}
            transition={{ duration, delay, ease: "easeOut" }}
            className="absolute top-0 h-3 w-2 rounded-sm"
            style={{ left: `${left}%`, backgroundColor: colors[i % colors.length] }}
          />
        );
      })}
    </div>
  );
}

function BackupModal({
  backupModal,
  onClose,
  onCopy,
}: {
  backupModal: BackupModalState;
  onClose: () => void;
  onCopy: () => void;
}) {
  if (!backupModal) return null;
  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-4xl border border-white/40 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Manual Backup</h3>
            <p className="mt-1 text-sm text-slate-500">
              Direct download is blocked in this environment. Copy the text below and save it as {backupModal.filename}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200" aria-label="Close backup modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <textarea readOnly value={backupModal.content} className="mt-4 h-72 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onCopy}>Copy Backup Text</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function WheelVisual({
  isSpinning,
  wheelRotation,
  onSpin,
  previewPrize,
  segments,
  wheelTextSize,
}: {
  isSpinning: boolean;
  wheelRotation: number;
  onSpin: () => void;
  previewPrize: string | null;
  segments: WheelSegment[];
  wheelTextSize: number;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[760px]">
      <div className="relative mx-auto aspect-square w-full max-w-[560px] shrink-0 md:max-w-[680px]">
        <div className="absolute -top-3 left-1/2 z-40 h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-orange-600 drop-shadow-lg md:-top-4" />
        <motion.div
          animate={{ rotate: wheelRotation }}
          transition={isSpinning ? { duration: 4.1, ease: [0.16, 0.86, 0.18, 1] } : { duration: 0 }}
          className="absolute inset-0 rounded-full border-4 border-white shadow-2xl ring-4 ring-orange-200"
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_center,#fff7ed_0%,#fed7aa_40%,#fdba74_82%,#fb923c_100%)]"
            style={{ containerType: "inline-size" }}
          >
            {segments.map((segment) => (
              <React.Fragment key={segment.value}>
                <div className="absolute inset-0" style={{ ...gradientStyle(segment.startColor, segment.endColor, segment.isDepleted ? 0.2 : 1), clipPath: segmentPolygon(segment.startAngle, segment.endAngle, 50, 24) }} />
                <SegmentLabel segment={segment} wheelTextSize={wheelTextSize} />
              </React.Fragment>
            ))}
            <div className="absolute inset-0 rounded-full border-2 border-white/35" />
            <div className="absolute inset-[12%] rounded-full border border-orange-100/40" />
            <div className="absolute inset-[24%] rounded-full border border-white/20" />
          </div>
          <button
            type="button"
            onClick={onSpin}
            disabled={isSpinning || segments.length === 0}
            className="absolute inset-[34%] z-30 flex cursor-pointer items-center justify-center rounded-full border-3 border-white/90 bg-[radial-gradient(circle_at_top,#ffffff,#fff7ed_60%,#fed7aa)] px-3 text-center shadow-2xl backdrop-blur-sm transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
          >
            <span className="max-w-[92%] text-sm font-bold leading-tight text-orange-700 md:text-lg">
              {isSpinning ? "Spinning..." : "Spin the Wheel"}
            </span>
          </button>
        </motion.div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {isSpinning && <div className="absolute inset-[-3%] animate-pulse rounded-full border border-orange-300/70" />}
        </div>
        {!isSpinning && previewPrize && (
          <div className="absolute -bottom-4 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-center text-xs font-medium text-slate-700 shadow-lg sm:text-sm">
            Latest result: {previewPrize}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultOverlay({ result, showStubNumber, onClose, onNext, overrides, iconOverrides }: { result: ClaimRecord | null; showStubNumber: boolean; onClose: () => void; onNext: () => void; overrides: PrizeColorOverrides; iconOverrides: IconOverrides }) {
  if (!result) return null;
  const meta = getPrizeMeta(result.isAdminChange ? "Candies" : result.prize, overrides);
  const isSpecial = PREMIUM_PRIZES.has(result.prize) && !result.isAdminChange;
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} className="absolute inset-x-4 top-24 z-50 mx-auto w-full max-w-xl">
        <ConfettiBurst show={isSpecial} />
        <div className="overflow-hidden rounded-4xl border border-white/30 text-slate-950 shadow-2xl" style={gradientStyle(meta.startColor, meta.endColor)}>
          <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4 md:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-black/60">{result.isAdminChange ? "Admin Change" : result.repeat ? "Existing Claim Found" : "Prize Revealed"}</p>
              <p className="mt-1 text-2xl font-black md:text-3xl">{result.prize}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-black/10 p-2 text-slate-950 transition hover:bg-black/20" aria-label="Close result">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid gap-5 px-5 py-5 md:grid-cols-[auto,1fr] md:items-center md:px-6">
            <div className="flex justify-center md:justify-start">
              <PrizeIllustration prize={result.isAdminChange ? "Candies" : result.prize} overrides={overrides} iconOverrides={iconOverrides} />
            </div>
            <div className="space-y-4 text-center md:text-left">
              <div className="rounded-2xl bg-white/35 p-4 shadow-sm">
                <p className="text-lg font-semibold">{result.name}</p>
                <p className="text-sm text-black/65">{result.company}</p>
                {showStubNumber && <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium md:justify-start"><Ticket className="h-4 w-4" /> {result.stubNumber}</p>}
                {result.details && result.details.length > 0 && <div className="mt-3 space-y-1 text-sm text-black/70">{result.details.map((detail, idx) => <p key={idx}>{detail}</p>)}</div>}
              </div>
              {!result.isAdminChange && <div className="flex flex-wrap gap-3 max-md:justify-center"><Button variant="secondary" className="rounded-xl bg-white text-slate-900 hover:bg-white/90" onClick={onNext}>Next Participant</Button></div>}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function AdminOverlay({
  open,
  onClose,
  password,
  setPassword,
  unlocked,
  message,
  onUnlock,
  onLock,
  remainingCounts,
  history,
  showStubNumber,
  setShowStubNumber,
  colorOverrides,
  onColorChange,
  onResetColors,
  iconOverrides,
  onIconChange,
  inventoryCounts,
  onInventoryCountChange,
  onApplyInventoryCounts,
  onRemoveClaim,
  onEditPrize,
  onResetInventory,
  pendingAdminAction,
  onConfirmPendingAction,
  onCancelPendingAction,
  onExportState,
  onImportState,
  wheelTextSize,
  onWheelTextSizeChange,
}: {
  open: boolean;
  onClose: () => void;
  password: string;
  setPassword: (v: string) => void;
  unlocked: boolean;
  message: string;
  onUnlock: () => void;
  onLock: () => void;
  remainingCounts: Record<string, number>;
  history: ClaimRecord[];
  showStubNumber: boolean;
  setShowStubNumber: (v: boolean) => void;
  colorOverrides: PrizeColorOverrides;
  onColorChange: (prize: string, field: keyof PrizeColorOverride, value: string) => void;
  onResetColors: () => void;
  iconOverrides: IconOverrides;
  onIconChange: (prize: string, icon: PrizeIconKey) => void;
  inventoryCounts: Record<string, number>;
  onInventoryCountChange: (prize: string, value: number) => void;
  onApplyInventoryCounts: () => void;
  onRemoveClaim: (stubNumber: string) => void;
  onEditPrize: (stubNumber: string, newPrize: string) => void;
  onResetInventory: () => void;
  pendingAdminAction: PendingAdminAction;
  onConfirmPendingAction: () => void;
  onCancelPendingAction: () => void;
  onExportState: () => void;
  onImportState: () => void;
  wheelTextSize: number;
  onWheelTextSizeChange: (value: number) => void;
}) {
  const [activePanel, setActivePanel] = useState<"overview" | "claims" | "colors" | "icons" | "inventory">("overview");
  if (!open) return null;
  const chocolateLeft = Object.entries(remainingCounts).filter(([key]) => key !== "Candies").reduce((sum, [, count]) => sum + count, 0);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-70 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
        <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-4xl border border-white/40 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><ShieldCheck className="h-6 w-6" /> Admin & Claim History</h2>
              <p className="mt-1 text-sm text-slate-500">Password-protected controls, recent claims, inventory, colors, icons, wheel text settings, and backups.</p>
            </div>
            <div className="flex items-center gap-2">
              {unlocked && <Button variant="outline" onClick={onLock}>🔒 Lock Admin</Button>}
              <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200" aria-label="Close admin"><X className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="max-h-[calc(90vh-92px)] overflow-auto px-6 py-5">
            {!unlocked ? (
              <div className="mx-auto max-w-md space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-password-popup">Administrator Password</Label>
                  <Input id="admin-password-popup" type="password" className="h-12 rounded-xl bg-white" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") onUnlock(); }} placeholder="Enter password" />
                </div>
                <Button onClick={onUnlock} className="bg-linear-to-r from-orange-500 to-orange-300 text-white hover:from-orange-500 hover:to-orange-300"><LockKeyhole className="mr-2 h-4 w-4" /> Unlock Admin</Button>
                {message && <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-900"><AlertDescription>{message}</AlertDescription></Alert>}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-orange-50 p-4"><p className="text-xs text-slate-500">Remaining Outcomes</p><p className="text-3xl font-bold">{Object.values(remainingCounts).reduce((a, b) => a + b, 0)}</p></div>
                  <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs text-slate-500">Claims</p><p className="text-3xl font-bold">{history.length}</p></div>
                  <div className="rounded-2xl bg-orange-100 p-4"><p className="text-xs text-slate-500">Chocolate Left</p><p className="text-3xl font-bold">{chocolateLeft}</p></div>
                  <div className="rounded-2xl bg-orange-50 p-4"><p className="text-xs text-slate-500">Candies Left</p><p className="text-3xl font-bold">{remainingCounts.Candies || 0}</p></div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border bg-white/70 px-4 py-3 text-sm text-slate-700"><input type="checkbox" checked={showStubNumber} onChange={(e) => setShowStubNumber(e.target.checked)} /> Show claim stub on result window</label>
                  <div className="rounded-xl border bg-white/70 px-4 py-3">
                    <Label htmlFor="wheel-text-size">Wheel text size</Label>
                    <div className="mt-2 flex items-center gap-3">
                      <Input id="wheel-text-size" type="range" min={10} max={22} step={1} value={wheelTextSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onWheelTextSizeChange(Number(e.target.value))} />
                      <span className="min-w-[40px] text-sm font-medium">{wheelTextSize}px</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant={activePanel === "overview" ? "default" : "outline"} onClick={() => setActivePanel("overview")}>Overview</Button>
                  <Button variant={activePanel === "claims" ? "default" : "outline"} onClick={() => setActivePanel("claims")}>Claims</Button>
                  <Button variant="outline" onClick={() => setActivePanel(activePanel === "colors" ? "overview" : "colors")}>Edit Colors</Button>
                  <Button variant="outline" onClick={() => setActivePanel(activePanel === "icons" ? "overview" : "icons")}>Edit Icons</Button>
                  <Button variant="outline" onClick={() => setActivePanel(activePanel === "inventory" ? "overview" : "inventory")}>Edit Inventory</Button>
                </div>

                <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <Button variant="outline" onClick={onExportState}>Save Backup File</Button>
                  <Button variant="outline" onClick={onImportState}>Import Backup File</Button>
                </div>

                {activePanel === "overview" && <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Hidden Prize Pool Breakdown</h3><div className="space-y-3">{Object.entries(remainingCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => { const meta = getPrizeMeta(label, colorOverrides); return <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4" style={gradientStyle(meta.chipStart, meta.chipEnd)}><span className="font-medium" style={{ color: meta.textColor }}>{label}</span><Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">{count}</Badge></div>; })}</div></div>}

                {activePanel === "claims" && <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Recent Claims</h3><div className="space-y-3">{history.length === 0 ? <p className="text-sm text-slate-500">No claims yet.</p> : history.map((item, index) => <div key={`${item.stubNumber}-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr,1fr,auto,auto] md:items-center"><div><p className="font-semibold text-slate-900">{item.name}</p><p className="text-sm text-slate-500">{item.company}</p></div><div><p className="font-medium text-slate-700">{item.stubNumber}</p><p className="text-sm text-slate-500">{item.claimedAt}</p><Badge className="mt-2 rounded-full px-3 py-1">{item.prize}</Badge>{item.details && <div className="mt-2 space-y-1 text-xs text-slate-500">{item.details.map((detail, idx) => <p key={idx}>{detail}</p>)}</div>}</div><div>{!item.isAdminChange && <select className="rounded-xl border px-2 py-1 text-sm" value={item.prize} onChange={(e) => onEditPrize(item.stubNumber, e.target.value)}>{PRIZES.map((p) => <option key={p.value} value={p.value}>{p.value}</option>)}</select>}</div><div className="flex justify-end"><Button variant="outline" className="rounded-xl" onClick={() => onRemoveClaim(item.stubNumber)}><Trash2 className="mr-2 h-4 w-4" /> Remove</Button></div></div>)}</div></div>}

                {activePanel === "colors" && <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-slate-900">Wheel Slice Colors</h3><Button variant="outline" onClick={onResetColors}>Reset Colors</Button></div><div className="space-y-3">{PRIZES.map((prize) => { const meta = getPrizeMeta(prize.value, colorOverrides); return <div key={prize.value} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1.2fr,auto,auto,auto] md:items-center"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full border border-slate-200" style={gradientStyle(meta.startColor, meta.endColor)} /><span className="font-medium text-slate-800">{prize.value}</span></div><label className="flex items-center gap-2 text-sm"><span>Start</span><input type="color" value={meta.startColor} onChange={(e) => onColorChange(prize.value, "startColor", e.target.value)} /></label><label className="flex items-center gap-2 text-sm"><span>End</span><input type="color" value={meta.endColor} onChange={(e) => onColorChange(prize.value, "endColor", e.target.value)} /></label><label className="flex items-center gap-2 text-sm"><span>Text</span><input type="color" value={meta.textColor} onChange={(e) => onColorChange(prize.value, "textColor", e.target.value)} /></label></div>; })}</div></div>}

                {activePanel === "icons" && <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Prize Icons</h3><div className="space-y-3">{PRIZES.map((prize) => { const iconValue = iconOverrides[prize.value] ?? DEFAULT_ICON_OVERRIDES[prize.value] ?? "gift"; return <div key={prize.value} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr,220px] md:items-center"><div className="flex items-center gap-3"><PrizeIllustration prize={prize.value} overrides={colorOverrides} iconOverrides={iconOverrides} /><span className="font-medium text-slate-800">{prize.value}</span></div><select className="rounded-xl border px-3 py-2 text-sm" value={iconValue} onChange={(e) => onIconChange(prize.value, e.target.value as PrizeIconKey)}><option value="candy">Candy</option><option value="cookie">Cookie</option><option value="sparkles">Sparkles</option><option value="package">Package</option><option value="gift">Gift</option><option value="circle">Circle</option><option value="star">Star</option><option value="heart">Heart</option><option value="diamond">Diamond</option><option value="box">Box</option><option value="dot">Dot</option></select></div>; })}</div></div>}

                {activePanel === "inventory" && <div className="space-y-3"><h3 className="text-lg font-semibold text-slate-900">Inventory Counts</h3><div className="space-y-3">{PRIZES.map((prize) => <div key={prize.value} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr,160px] md:items-center"><div className="flex items-center gap-3"><span className="font-medium text-slate-800">{prize.value}</span></div><Input type="number" min={0} value={inventoryCounts[prize.value] ?? 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onInventoryCountChange(prize.value, Number(e.target.value) || 0)} className="h-10 rounded-xl bg-white" /></div>)}</div><div className="flex flex-wrap gap-2"><Button onClick={onApplyInventoryCounts}>Apply Inventory Counts</Button><Button variant="destructive" onClick={onResetInventory}><RotateCcw className="mr-2 h-4 w-4" /> Reset Inventory</Button></div>{pendingAdminAction && <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950"><p className="font-semibold">{pendingAdminAction.kind === "apply-inventory" ? "Confirm inventory changes" : "Confirm inventory reset"}</p><div className="mt-2 space-y-1 text-sm">{pendingAdminAction.details.map((detail, idx) => <p key={idx}>{detail}</p>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={onConfirmPendingAction}>Confirm</Button><Button variant="outline" onClick={onCancelPendingAction}>Cancel</Button></div></div>}</div>}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function SCRCGiveawayRaffle() {
  const [appState, setAppState] = useState<AppState>(() => loadState());
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ClaimRecord | null>(null);
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, number>>(countsFromInventory(DEFAULT_INVENTORY));
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [showStubNumber, setShowStubNumber] = useState(true);
  const [currentEntry, setCurrentEntry] = useState<{ name: string; company: string } | null>(null);
  const [currentView, setCurrentView] = useState<"entry" | "wheel">("entry");
  const [showResultOverlay, setShowResultOverlay] = useState(true);
  const [showAdminOverlay, setShowAdminOverlay] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<PendingAdminAction>(null);
  const [backupModal, setBackupModal] = useState<BackupModalState>(null);
  const spinTimeoutRef = useRef<number | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    runSanityChecks();
  }, []);

  useEffect(() => {
    saveState(appState);
  }, [appState]);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current !== null) {
        window.clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  const remainingCounts = useMemo(
    () =>
      appState.inventory.reduce<Record<string, number>>((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      }, {}),
    [appState.inventory]
  );

  const featuredPrizes = useMemo(
    () => FEATURED_PRIZES.map((item) => ({ ...getPrizeMeta(item.value, appState.colorOverrides) })),
    [appState.colorOverrides]
  );

  const wheelSegments = useMemo(
    () => buildEqualSegments(appState.inventory, appState.colorOverrides),
    [appState.inventory, appState.colorOverrides]
  );

  const summarizeInventoryDiff = (before: Record<string, number>, after: Record<string, number>): string[] => {
    return PRIZES.map((p) => {
      const prev = before[p.value] || 0;
      const next = after[p.value] || 0;
      const diff = next - prev;
      if (diff === 0) return null;
      return `${p.value}: ${prev} → ${next} (${diff > 0 ? "+" : ""}${diff})`;
    }).filter(Boolean) as string[];
  };

  const exportStateToFile = async () => {
    const payload = { exportedAt: new Date().toISOString(), appState };
    const content = JSON.stringify(payload, null, 2);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `scrc-raffle-backup-${stamp}.json`;
    const fileBlob = new Blob([content], { type: "application/json" });

    // Always open the manual backup modal too, so the user has a guaranteed fallback.
    setBackupModal({ filename, content });

    let saveAttempted = false;
    let saveSucceeded = false;

    try {
      const nav = navigator as Navigator & {
        showSaveFilePicker?: (options?: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (data: Blob | string) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      };

      if (typeof nav.showSaveFilePicker === "function") {
        saveAttempted = true;
        const handle = await nav.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "JSON Backup", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(fileBlob);
        await writable.close();
        saveSucceeded = true;
      }
    } catch {
      // Ignore and fall through to download/manual backup.
    }

    if (!saveSucceeded) {
      try {
        saveAttempted = true;
        const url = URL.createObjectURL(fileBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // Ignore and rely on manual backup modal.
      }
    }

    if (saveSucceeded) {
      setMessage("Save dialog completed. The manual backup is also open as a fallback.");
    } else if (saveAttempted) {
      setMessage("Save/download was attempted. The manual backup is also open below in case this environment blocks file saving.");
    } else {
      setMessage("This environment is blocking file saving. Use the manual backup window below.");
    }
  };

  const copyBackupText = async () => {
    if (!backupModal) return;
    try {
      await navigator.clipboard.writeText(backupModal.content);
      setMessage("Backup JSON copied to clipboard.");
    } catch {
      setMessage("Could not copy automatically. Please manually copy the backup text.");
    }
  };

  const importStateFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { appState?: unknown } | unknown;
      const candidate = parsed && typeof parsed === "object" && "appState" in (parsed as Record<string, unknown>)
        ? (parsed as { appState?: unknown }).appState
        : parsed;
      const sanitized = sanitizeImportedState(candidate);
      if (!sanitized) {
        setMessage("Import failed: invalid backup file.");
        return;
      }
      setAppState(sanitized);
      setPendingAdminAction(null);
      setResult(null);
      setBackupModal(null);
      setMessage("Backup imported successfully.");
    } catch {
      setMessage("Import failed: could not read the backup file.");
    }
  };

  const goToWheelPage = () => {
    setMessage("");
    setResult(null);
    const cleanName = normalizeValue(name);
    const cleanCompany = normalizeValue(company);
    if (!cleanName || !cleanCompany) {
      setMessage("Please enter both name and company.");
      return;
    }
    setCurrentEntry({ name: cleanName, company: cleanCompany });
    setCurrentView("wheel");
  };

  const claimPrize = () => {
    if (isSpinning || !currentEntry || wheelSegments.length === 0) return;
    setMessage("");
    setResult(null);
    setShowResultOverlay(false);

    const key = makeClaimKey(currentEntry.name, currentEntry.company);
    if (appState.claims[key]) {
      setResult({ ...appState.claims[key], repeat: true });
      setShowResultOverlay(true);
      return;
    }

    if (appState.inventory.length === 0) {
      setMessage("No raffle items remaining.");
      return;
    }

    const prize = appState.inventory[0];
    const targetSegment = wheelSegments.find((segment) => segment.value === prize);
    if (!targetSegment) {
      setMessage("Prize wheel could not find a matching segment.");
      return;
    }

    const nextStubNumber = appState.lastStubNumber + 1;
    const claimRecord: ClaimRecord = {
      name: currentEntry.name,
      company: currentEntry.company,
      prize,
      stubNumber: prettyStubNumber(nextStubNumber),
      claimedAt: new Date().toLocaleString(),
    };

    const randomWithinSegment = targetSegment.startAngle + Math.random() * targetSegment.sweep;
    const targetRotationOffset = 270 - randomWithinSegment;
    const extraTurns = 360 * (6 + Math.floor(Math.random() * 2));
    const normalizedCurrent = ((wheelRotation % 360) + 360) % 360;
    const delta = ((targetRotationOffset - normalizedCurrent) % 360 + 360) % 360;
    const nextRotation = wheelRotation + extraTurns + delta;

    setIsSpinning(true);
    setWheelRotation(nextRotation);

    if (spinTimeoutRef.current !== null) {
      window.clearTimeout(spinTimeoutRef.current);
    }

    spinTimeoutRef.current = window.setTimeout(() => {
      setAppState((prev) => ({
        ...prev,
        inventory: prev.inventory.slice(1),
        lastStubNumber: nextStubNumber,
        claims: { ...prev.claims, [key]: claimRecord },
        history: [claimRecord, ...prev.history],
      }));
      setResult({ ...claimRecord, repeat: false });
      setShowResultOverlay(true);
      setIsSpinning(false);
      spinTimeoutRef.current = null;
    }, 4100);
  };

  const startNextParticipant = () => {
    setName("");
    setCompany("");
    setCurrentEntry(null);
    setResult(null);
    setMessage("");
    setShowResultOverlay(true);
    setCurrentView("entry");
  };

  const backToEntry = () => {
    if (isSpinning) return;
    setCurrentView("entry");
    setResult(null);
    setCurrentEntry(null);
    setShowResultOverlay(true);
  };

  const applyInventoryCounts = () => {
    const total = Object.values(inventoryCounts).reduce((sum, value) => sum + Math.max(0, value || 0), 0);
    if (total <= 0) {
      setMessage("Inventory counts must total at least 1.");
      return;
    }
    const before = countsFromInventory(appState.inventory);
    const after = { ...inventoryCounts };
    const details = summarizeInventoryDiff(before, after);
    if (details.length === 0) {
      setMessage("No inventory changes detected.");
      return;
    }
    setPendingAdminAction({ kind: "apply-inventory", details, nextCounts: after });
  };

  const resetInventory = () => {
    const before = countsFromInventory(appState.inventory);
    const after = countsFromInventory(DEFAULT_INVENTORY);
    const details = summarizeInventoryDiff(before, after);
    setPendingAdminAction({
      kind: "reset-inventory",
      details: details.length ? details : ["Inventory will be restored to default counts and claims will be cleared."],
      nextCounts: after,
    });
  };

  const confirmPendingAdminAction = () => {
    if (!pendingAdminAction) return;

    if (pendingAdminAction.kind === "apply-inventory") {
      const nextInventory = inventoryFromCounts(pendingAdminAction.nextCounts);
      setAppState((prev) => {
        const nextStub = prev.lastStubNumber + 1;
        const ticket: ClaimRecord = {
          name: ADMIN_ACTOR,
          company: "System",
          prize: "Admin Inventory Change",
          stubNumber: prettyStubNumber(nextStub),
          claimedAt: new Date().toLocaleString(),
          isAdminChange: true,
          details: pendingAdminAction.details,
        };
        return {
          ...prev,
          inventory: nextInventory,
          lastStubNumber: nextStub,
          history: [ticket, ...prev.history],
        };
      });
      setInventoryCounts(countsFromInventory(nextInventory));
      setResult(null);
      setShowResultOverlay(true);
      setMessage(`Applied inventory changes. ${pendingAdminAction.details.length} adjustment(s) recorded in admin history.`);
      setPendingAdminAction(null);
      return;
    }

    if (spinTimeoutRef.current !== null) {
      window.clearTimeout(spinTimeoutRef.current);
      spinTimeoutRef.current = null;
    }

    setAppState((prev) => {
      const nextStub = prev.lastStubNumber + 1;
      const ticket: ClaimRecord = {
        name: ADMIN_ACTOR,
        company: "System",
        prize: "Admin Inventory Reset",
        stubNumber: prettyStubNumber(nextStub),
        claimedAt: new Date().toLocaleString(),
        isAdminChange: true,
        details: pendingAdminAction.details,
      };
      return {
        ...prev,
        inventory: shuffle(DEFAULT_INVENTORY),
        claims: {},
        history: [ticket],
        lastStubNumber: nextStub,
      };
    });
    setInventoryCounts(countsFromInventory(DEFAULT_INVENTORY));
    setCurrentEntry(null);
    setCurrentView("entry");
    setResult(null);
    setShowResultOverlay(true);
    setIsSpinning(false);
    setWheelRotation(0);
    setMessage("Inventory and claims have been reset to default state.");
    setPendingAdminAction(null);
  };

  const cancelPendingAdminAction = () => {
    setPendingAdminAction(null);
  };

  const unlockAdmin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setAdminMessage("");
      setAdminPasswordInput("");
    } else {
      setAdminMessage("Incorrect administrator password.");
    }
  };

  const lockAdmin = () => {
    setAdminUnlocked(false);
    setAdminPasswordInput("");
    setAdminMessage("");
  };

  const removeClaim = (stubNumber: string) => {
    const record = appState.history.find((item) => item.stubNumber === stubNumber);
    if (!record) return;
    const nextHistory = appState.history.filter((item) => item.stubNumber !== stubNumber);
    const nextClaims = { ...appState.claims };
    const claimKey = Object.keys(nextClaims).find((key) => nextClaims[key].stubNumber === stubNumber);
    if (claimKey) delete nextClaims[claimKey];
    const nextInventory = record.isAdminChange ? appState.inventory : shuffle([...appState.inventory, record.prize]);
    setAppState({ ...appState, history: nextHistory, claims: nextClaims, inventory: nextInventory });
    setInventoryCounts(countsFromInventory(nextInventory));
  };

  const editPrize = (stubNumber: string, newPrize: string) => {
    const record = appState.history.find((item) => item.stubNumber === stubNumber);
    if (!record || record.prize === newPrize || record.isAdminChange) return;
    const nextHistory = appState.history.map((item) => (item.stubNumber === stubNumber ? { ...item, prize: newPrize } : item));
    const nextClaims = { ...appState.claims };
    Object.keys(nextClaims).forEach((key) => {
      if (nextClaims[key].stubNumber === stubNumber) nextClaims[key] = { ...nextClaims[key], prize: newPrize };
    });
    const nextInventory = [...appState.inventory, record.prize];
    const replacementIndex = nextInventory.findIndex((item) => item === newPrize);
    if (replacementIndex >= 0) nextInventory.splice(replacementIndex, 1);
    const shuffledInventory = shuffle(nextInventory);
    setAppState({ ...appState, history: nextHistory, claims: nextClaims, inventory: shuffledInventory });
    setInventoryCounts(countsFromInventory(shuffledInventory));
  };

  const updatePrizeColor = (prize: string, field: keyof PrizeColorOverride, value: string) => {
    setAppState((prev) => ({
      ...prev,
      colorOverrides: {
        ...prev.colorOverrides,
        [prize]: {
          startColor: prev.colorOverrides[prize]?.startColor ?? getPrizeMeta(prize, prev.colorOverrides).startColor,
          endColor: prev.colorOverrides[prize]?.endColor ?? getPrizeMeta(prize, prev.colorOverrides).endColor,
          textColor: prev.colorOverrides[prize]?.textColor ?? getPrizeMeta(prize, prev.colorOverrides).textColor,
          [field]: value,
        },
      },
    }));
  };

  return currentView === "wheel" ? (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed_0%,#fed7aa_34%,#fdba74_76%,#ffffff_100%)] p-4 md:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col justify-between rounded-4xl border border-orange-100/70 bg-white/45 p-6 shadow-2xl backdrop-blur md:p-8">
        <div className="flex items-center justify-between gap-4">
          <Button variant="outline" className="rounded-full bg-white/80" onClick={backToEntry} disabled={isSpinning}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-orange-700">SEM-CALACA RES CORPORATION (SCRC)</p>
            <p className="text-xs uppercase tracking-[0.2em] text-orange-600">Giveaway Raffle</p>
            <p className="text-lg font-semibold text-slate-900">{currentEntry?.name}</p>
            <p className="text-sm text-slate-600">{currentEntry?.company}</p>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <div className="text-center"><h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">Spin the Wheel</h1></div>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 md:gap-3">
            {featuredPrizes.map((item) => <div key={item.value} className="rounded-full px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-white/70" style={{ ...gradientStyle(item.chipStart, item.chipEnd), color: item.textColor }}>{item.label}</div>)}
          </div>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-8 py-4">
          <WheelVisual isSpinning={isSpinning} wheelRotation={wheelRotation} onSpin={claimPrize} previewPrize={result?.prize ?? null} segments={wheelSegments} wheelTextSize={appState.wheelTextSize} />
          <ResultOverlay result={showResultOverlay ? result : null} showStubNumber={showStubNumber} onClose={() => setShowResultOverlay(false)} onNext={startNextParticipant} overrides={appState.colorOverrides} iconOverrides={appState.iconOverrides} />
          {message && <Alert className="w-full max-w-2xl rounded-2xl border-orange-200 bg-orange-50 text-orange-900"><AlertDescription>{message}</AlertDescription></Alert>}
        </div>
      </div>
    </div>
  ) : (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed_0%,#fed7aa_34%,#fdba74_76%,#ffffff_100%)] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-4xl border border-orange-100/70 bg-white/60 p-8 shadow-xl backdrop-blur">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange-300/35 blur-3xl" />
          <div className="absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-orange-200/30 blur-3xl" />
          <div className="relative space-y-6">
            <div className="space-y-4">
              <Badge className="rounded-full bg-orange-100 px-4 py-1 text-orange-700 hover:bg-orange-100">SCRC Event Booth</Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-5xl"><span className="block">SEM-CALACA RES CORPORATION (SCRC)</span><span className="block">Giveaway Raffle</span></h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-700 md:text-base">Enter your name and company first, then proceed to the full-screen wheel.</p>
              </div>
            </div>

            <Card className="rounded-4xl border-orange-100/70 bg-white/70 shadow-lg backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl"><Gift className="h-6 w-6" /> Participant Entry</CardTitle>
                <CardDescription>One entry per unique name and company combination.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <div className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="name" className="h-12 rounded-xl bg-white/90 pl-10" placeholder="Enter full name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <div className="relative"><Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="company" className="h-12 rounded-xl bg-white/90 pl-10" placeholder="Enter company name" value={company} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompany(e.target.value)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") goToWheelPage(); }} /></div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button className="h-12 rounded-xl bg-linear-to-r from-orange-500 to-orange-300 px-8 text-base text-white hover:from-orange-500 hover:to-orange-300" onClick={goToWheelPage}>Proceed to Wheel</Button>
                  <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => { setInventoryCounts(countsFromInventory(appState.inventory)); setShowAdminOverlay(true); }}><ShieldCheck className="mr-2 h-4 w-4" /> Admin & History</Button>
                </div>
                {message && <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-900"><AlertDescription>{message}</AlertDescription></Alert>}
              </CardContent>
            </Card>

            <div className="border-t border-orange-100/70 pt-6">
              <div className="mb-3 text-center text-sm font-medium text-slate-600">Possible prizes</div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {FEATURED_PRIZES.map((item) => {
                  const meta = getPrizeMeta(item.value, appState.colorOverrides);
                  return (
                    <motion.div key={item.value} whileHover={{ y: -4 }} className="rounded-3xl p-4 shadow-md" style={gradientStyle(meta.chipStart, meta.chipEnd)}>
                      <PrizeIllustration prize={item.value} overrides={appState.colorOverrides} iconOverrides={appState.iconOverrides} />
                      <p className="mt-3 text-center text-sm font-medium leading-tight" style={{ color: meta.textColor }}>{item.label}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <input ref={importFileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importStateFromFile(file); e.currentTarget.value = ""; }} />

      <BackupModal backupModal={backupModal} onClose={() => setBackupModal(null)} onCopy={() => void copyBackupText()} />

      <AdminOverlay
        open={showAdminOverlay}
        onClose={() => setShowAdminOverlay(false)}
        password={adminPasswordInput}
        setPassword={setAdminPasswordInput}
        unlocked={adminUnlocked}
        message={adminMessage}
        onUnlock={unlockAdmin}
        onLock={lockAdmin}
        remainingCounts={remainingCounts}
        history={appState.history}
        showStubNumber={showStubNumber}
        setShowStubNumber={setShowStubNumber}
        colorOverrides={appState.colorOverrides}
        onColorChange={updatePrizeColor}
        onResetColors={() => setAppState((prev) => ({ ...prev, colorOverrides: {} }))}
        iconOverrides={appState.iconOverrides}
        onIconChange={(prize, icon) => setAppState((prev) => ({ ...prev, iconOverrides: { ...prev.iconOverrides, [prize]: icon } }))}
        inventoryCounts={inventoryCounts}
        onInventoryCountChange={(prize, value) => setInventoryCounts((prev) => ({ ...prev, [prize]: Math.max(0, value) }))}
        onApplyInventoryCounts={applyInventoryCounts}
        onRemoveClaim={removeClaim}
        onEditPrize={editPrize}
        onResetInventory={resetInventory}
        pendingAdminAction={pendingAdminAction}
        onConfirmPendingAction={confirmPendingAdminAction}
        onCancelPendingAction={cancelPendingAdminAction}
        onExportState={() => void exportStateToFile()}
        onImportState={() => importFileRef.current?.click()}
        wheelTextSize={appState.wheelTextSize}
        onWheelTextSizeChange={(value) => setAppState((prev) => ({ ...prev, wheelTextSize: value }))}
      />
    </div>
  );
}
