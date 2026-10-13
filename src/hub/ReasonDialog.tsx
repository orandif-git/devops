import * as React from "react";
import { MIN_REASON, validReason } from "../core/audit";

export interface Reason { reason: string; comment: string }

/** Modal that must be filled in before settings are saved. Both fields are free text of at least MIN_REASON characters. */
export function ReasonDialog(p: { title: string; summary?: string; onConfirm(r: Reason): void; onCancel(): void }) {
  const [reason, setReason] = React.useState("");
  const [comment, setComment] = React.useState("");
  const ok = validReason(reason) && validReason(comment);
  const first = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { first.current?.focus(); }, []);
  const left = (s: string) => (validReason(s) ? "" : `${Math.max(0, MIN_REASON - s.trim().length)} more character(s)`);
  return (
    <div className="modal-back" role="presentation" onKeyDown={e => { if (e.key === "Escape") p.onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reason-title">
        <h3 id="reason-title" style={{ marginTop: 0 }}>{p.title}</h3>
        {p.summary && <div className="muted" style={{ marginBottom: 8 }}>{p.summary}</div>}
        <label className="field"><span>Reason for the change <b className="err">*</b></span>
          <textarea ref={first} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being changed?" /></label>
        <div className="muted">{left(reason)}</div>
        <label className="field"><span>Comments <b className="err">*</b></span>
          <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ticket number, approval, anything a reviewer should know" /></label>
        <div className="muted">{left(comment)}</div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!ok} onClick={() => p.onConfirm({ reason: reason.trim(), comment: comment.trim() })}>Save change</button>
          <button className="btn" onClick={p.onCancel}>Cancel</button>
          <span className="muted">Recorded in the audit log with your name and the time.</span>
        </div>
      </div>
    </div>
  );
}

/** `ask()` opens the dialog and resolves with the text, or null when cancelled; render `dialog` somewhere in the page. */
export function useReason() {
  const [open, setOpen] = React.useState<{ title: string; summary?: string; done(r: Reason | null): void }>();
  const ask = React.useCallback((title: string, summary?: string) => new Promise<Reason | null>(resolve => setOpen({ title, summary, done: r => { setOpen(undefined); resolve(r); } })), []);
  const dialog = open ? <ReasonDialog title={open.title} summary={open.summary} onConfirm={open.done} onCancel={() => open.done(null)} /> : null;
  return { ask, dialog };
}
