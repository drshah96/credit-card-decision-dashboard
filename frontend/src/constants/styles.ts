import type { VerdictStatus } from "../types/cards";

export const VERDICT_STYLES: Record<VerdictStatus, string> = {
  keep: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  situational: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  reconsider: "bg-red-500/10 text-red-700 border-red-500/30",
};