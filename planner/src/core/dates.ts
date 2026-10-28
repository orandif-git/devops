import { formatDateText } from "../../../src/core/dateFormat";
import { PlannerSettings } from "./types";

/** Date and month formats an administrator can choose (the stored values are always YYYY-MM-DD and YYYY-MM). */
export const DATE_CHOICES = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "DD-MMM-YYYY", "D MMM YYYY"];
export const MONTH_CHOICES = ["YYYY-MM", "MM/YYYY", "MM-YYYY", "MMM YYYY", "MMM-YY", "MMMM YYYY"];

/** A date ("2026-10-25") as the administrator chose to see it; the standard look is YYYY-MM-DD. */
export const fmtDate = (s: Pick<PlannerSettings, "dateFormat"> | undefined, v: string | undefined | null): string => (v ? formatDateText(v, s?.dateFormat || "YYYY-MM-DD") : "");
/** A month ("2026-10") as the administrator chose to see it; the standard look is YYYY-MM. */
export const fmtMonth = (s: Pick<PlannerSettings, "monthFormat"> | undefined, v: string | undefined | null): string => (v ? formatDateText(v, s?.monthFormat || "YYYY-MM") : "");
