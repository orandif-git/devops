import * as React from "react";

/**
 * The question asked before something is deleted in the settings: what goes, what uses it, and a red button named for the action.
 * It is part of the page (not the browser's pop-up, which an extension frame may block), closes with Escape and starts on Cancel.
 */
export function ConfirmDialog(p: { title: string; message?: React.ReactNode; counts?: string[]; usedBy?: string[]; confirmLabel: string; onCancel(): void; onConfirm(): void }) {
  return (
    <div className="cdlg-back" onMouseDown={e => { if (e.target === e.currentTarget) p.onCancel(); }} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); p.onCancel(); } }}>
      <div className="cdlg" role="alertdialog" aria-modal="true" aria-label={p.title}>
        <h4>{p.title}</h4>
        {p.message && <p>{p.message}</p>}
        {p.usedBy && p.usedBy.length > 0 && <div className="cdlg-warn" role="note">Used by: {p.usedBy.join(", ")}</div>}
        {p.counts && p.counts.length > 0 && <ul>{p.counts.map(c => <li key={c}>{c}</li>)}</ul>}
        <div className="cdlg-acts"><button className="btn" autoFocus onClick={p.onCancel}>Cancel</button><button className="btn danger" onClick={p.onConfirm}>{p.confirmLabel}</button></div>
      </div>
    </div>
  );
}
