import { Band } from "../core/aggregate";

/** Traffic-light band look shared by the widgets (same colours, symbols and words as the heatmap). */
export const BAND: Record<Band, { color: string; text: string; icon: string; label: string }> = {
  spare: { color: "#9ec5f4", text: "#0d366b", icon: "", label: "Spare capacity" },
  healthy: { color: "#0ca30c", text: "#fff", icon: "✓", label: "Healthy" },
  full: { color: "#fab219", text: "#0b0b0b", icon: "▲", label: "Nearly full" },
  over: { color: "#d03b3b", text: "#fff", icon: "!", label: "Over capacity" },
  none: { color: "transparent", text: "inherit", icon: "", label: "No capacity entered" },
};
const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m: string) => `${NAMES[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
export const monthShort = (m: string) => NAMES[+m.slice(5) - 1];
export const pct = (r: number | null) => (r === null ? "–" : !isFinite(r) ? "no capacity" : Math.round(r * 100) + "%");
