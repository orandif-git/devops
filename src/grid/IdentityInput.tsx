import * as React from "react";
import { IdentityHit, searchIdentities } from "../shared/identity";

interface Props {
  value: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  includeGroups: boolean;
  projectId: string;
  onChange(v: string): void;
  /** injectable for tests */
  search?: (q: string, groups: boolean, projectId: string) => Promise<IdentityHit[]>;
}

/** Text box with directory search: pick a user or group from the dropdown (or keep typed text). */
export function IdentityInput(p: Props) {
  const [text, setText] = React.useState(p.value);
  const [hits, setHits] = React.useState<IdentityHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState<{ left: number; top: number; width: number }>();
  const ref = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<number>();
  const seq = React.useRef(0);
  const search = p.search ?? searchIdentities;

  React.useEffect(() => { setText(p.value); }, [p.value]);

  // the iframe is only as tall as the grid: give the popup room while it is open
  React.useEffect(() => {
    document.body.style.minHeight = open ? "330px" : "";
    return () => { document.body.style.minHeight = ""; };
  }, [open]);

  const run = (q: string) => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    timer.current = window.setTimeout(async () => {
      const mine = ++seq.current;
      const r = await search(q, p.includeGroups, p.projectId).catch(() => []);
      if (mine === seq.current) { setHits(r); setActive(0); setBusy(false); }
    }, 250);
  };

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom, width: Math.max(r.width, 260) });
  };

  const pick = (h: IdentityHit) => { setText(h.text); setOpen(false); setHits([]); p.onChange(h.text); };

  return (
    <>
      <input ref={ref} className={p.className} title={p.title} type="text" disabled={p.disabled} value={text} role="combobox" aria-expanded={open}
        placeholder="Search name, email or group…" autoComplete="off"
        onChange={e => { setText(e.target.value); p.onChange(e.target.value); setOpen(true); place(); run(e.target.value); }}
        onFocus={() => { if (text.trim().length >= 2) { setOpen(true); place(); run(text); } }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && pos && (busy || hits.length > 0 || text.trim().length >= 2) && (
        <ul className="idpop" style={{ left: pos.left, top: pos.top, width: pos.width }} role="listbox">
          {busy && !hits.length && <li className="muted">Searching…</li>}
          {!busy && !hits.length && <li className="muted">No matches – the typed text will be kept.</li>}
          {hits.map((h, i) => (
            <li key={h.text + i} role="option" aria-selected={i === active} className={i === active ? "on" : ""}
              onMouseDown={e => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}>
              <span className="ico">{h.kind === "group" ? "👥" : "👤"}</span>
              <span className="nm">{h.displayName}</span><span className="dt">{h.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
