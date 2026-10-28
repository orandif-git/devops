import * as React from "react";
import { SavedView } from "../core/views";

/** "Views": the person's own saved views (private to them), a link to share the current view, and a reset. */
export function ViewsMenu(p: {
  views: SavedView[]; defaultId?: string; error?: string;
  onApply(v: SavedView): void; onSave(name: string): void; onUpdate(id: string): void; onRename(id: string, name: string): void; onDelete(id: string): void;
  onDefault(id: string | undefined): void; onReset(): void; onLink(): Promise<string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [renaming, setRenaming] = React.useState<{ id: string; text: string }>();
  const [link, setLink] = React.useState(""), [note, setNote] = React.useState("");
  const copy = async () => {
    setNote(""); setLink("");
    try {
      const url = await p.onLink();
      try { await navigator.clipboard.writeText(url); setNote("Link copied. Anyone who can open the Planner can use it."); setLink(url); }
      catch { setNote("Copy this link:"); setLink(url); }
    } catch (e) { setNote((e as Error).message); }
  };
  return (
    <span className="cc-anchor">
      <button className="pill" aria-expanded={open} onClick={() => setOpen(!open)}>★ Views{p.views.length ? ` (${p.views.length})` : ""}</button>
      {open && <div className="cc-drawer views" role="dialog" aria-label="My views" style={{ width: 340 }}>
        <h4>My views <span className="muted" style={{ fontWeight: 400 }}>· private to you</span></h4>
        {!p.views.length && <div className="muted" style={{ marginBottom: 8 }}>No saved views yet. Set up the Planner the way you like it and save it below.</div>}
        {p.views.map(v => <div key={v.id} className="vrow">
          {renaming?.id === v.id
            ? <input autoFocus value={renaming.text} aria-label="View name" onChange={e => setRenaming({ id: v.id, text: e.target.value })} onKeyDown={e => { if (e.key === "Enter" && renaming.text.trim()) { p.onRename(v.id, renaming.text.trim()); setRenaming(undefined); } if (e.key === "Escape") setRenaming(undefined); }} />
            : <button className="lk vname" title="Open this view" onClick={() => { p.onApply(v); setOpen(false); }}>{v.name}<span className="muted"> · {{ heat: "Heatmap", time: "Timeline", gantt: "Epic Gantt" }[v.state.view]}</span></button>}
          <button className={"btn icon" + (p.defaultId === v.id ? " on" : "")} aria-pressed={p.defaultId === v.id} title={p.defaultId === v.id ? "This opens by default. Click to stop." : "Open this view by default"} aria-label={`Default view: ${v.name}`} onClick={() => p.onDefault(p.defaultId === v.id ? undefined : v.id)}>{p.defaultId === v.id ? "★" : "☆"}</button>
          <button className="btn icon" title="Replace this view with what is on screen now" aria-label={`Update ${v.name}`} onClick={() => p.onUpdate(v.id)}>⟳</button>
          <button className="btn icon" title="Rename" aria-label={`Rename ${v.name}`} onClick={() => setRenaming({ id: v.id, text: v.name })}>✎</button>
          <button className="btn icon danger" title="Delete" aria-label={`Delete ${v.name}`} onClick={() => p.onDelete(v.id)}>✕</button>
        </div>)}
        <h4 style={{ marginTop: 10 }}>Save what is on screen</h4>
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ flex: 1 }} placeholder="Name, for example Late Epics by area" aria-label="New view name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && name.trim()) { p.onSave(name.trim()); setName(""); } }} />
          <button className="btn primary" disabled={!name.trim()} onClick={() => { p.onSave(name.trim()); setName(""); }}>Save</button>
        </div>
        <h4 style={{ marginTop: 10 }}>Share</h4>
        <button className="btn" onClick={copy}>🔗 Copy link to this view</button>
        {note && <div className="muted" role="status" style={{ marginTop: 4 }}>{note}</div>}
        {link && <input readOnly aria-label="Link" value={link} style={{ width: "100%", marginTop: 4 }} onFocus={e => e.target.select()} />}
        <div style={{ marginTop: 10 }}><button className="lk" onClick={() => { p.onReset(); setOpen(false); }}>Reset to the standard view</button></div>
        {p.error && <div className="err" role="alert" style={{ marginTop: 6 }}>{p.error}</div>}
      </div>}
    </span>
  );
}
