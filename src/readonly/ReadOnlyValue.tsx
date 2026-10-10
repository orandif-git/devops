import * as React from "react";
import { formatValue } from "../core/written";

/** A value the user cannot edit (calculated by the extension). */
export function ReadOnlyValue(p: { value: unknown; note?: string }) {
  return (
    <div className="rov" title={p.note ?? "Calculated automatically – cannot be edited"}>
      <span className="val">{formatValue(p.value)}</span>
      <span className="lock" aria-hidden>🔒</span>
    </div>
  );
}
