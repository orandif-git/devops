import * as React from "react";
import { WidgetData } from "../core/widgets";
import { BAND, monthName, monthShort, pct } from "./palette";

export type Kind = "tile" | "over" | "teams";

const Chip = ({ band }: { band: keyof typeof BAND }) => <span className="sw" aria-hidden="true" style={{ background: BAND[band].color, color: BAND[band].text }}>{BAND[band].icon}</span>;

export function Tile({ d }: { d: WidgetData }) {
  const t = d.tile;
  return (
    <div className="wg" role="group" aria-label={`Utilization ${monthName(d.month)}`}>
      <div className="wg-l">Utilization · {monthName(d.month)}</div>
      <div className="wg-v" style={{ display: "flex", alignItems: "center", gap: 8 }}><Chip band={t.band} />{pct(t.utilization)}</div>
      <div className="wg-d">{t.hours} h booked of {t.available} h available · {t.free} h free</div>
      <div className="wg-bands">
        {(["over", "full", "healthy", "spare"] as const).map(b => <span key={b} title={BAND[b].label}><Chip band={b} /> {t.counts[b]} <span className="muted">{BAND[b].label}</span></span>)}
      </div>
    </div>
  );
}

export function OverList({ d, onOpen }: { d: WidgetData; onOpen?: () => void }) {
  return (
    <div className="wg" role="group" aria-label="People over capacity">
      <div className="wg-l">Over capacity · {monthName(d.month)}</div>
      {!d.over.length ? <div className="wg-d" style={{ marginTop: 8 }}>✓ Nobody is over capacity this month.</div> : (
        <table className="wg-t"><tbody>
          {d.over.map(r => <tr key={r.key}><td><Chip band="over" /></td><td className="n" title={r.name}>{r.name}<div className="muted">{r.team}</div></td><td className="r"><b>{pct(r.ratio)}</b><div className="muted">{r.hours} / {r.available ?? 0} h</div></td></tr>)}
        </tbody></table>)}
      {d.overTotal > d.over.length && <div className="wg-d">+ {d.overTotal - d.over.length} more · <a href="#" onClick={e => { e.preventDefault(); onOpen?.(); }}>open the Resource Planner</a></div>}
    </div>
  );
}

export function TeamMap({ d }: { d: WidgetData }) {
  return (
    <div className="wg" role="group" aria-label="Team utilization">
      <div className="wg-l">Team utilization · {monthName(d.months[0])} onwards</div>
      {!d.teams.length ? <div className="wg-d">No capacity or hours found.</div> : (
        <table className="wg-m"><thead><tr><th /> {d.months.map(m => <th key={m}>{monthShort(m)}</th>)}</tr></thead><tbody>
          {d.teams.map(t => <tr key={t.team}><th scope="row" className="n" title={t.team}>{t.team}</th>
            {t.cells.map(c => <td key={c.month} className="cellw"><div className="cell" title={`${t.team} · ${monthName(c.month)}: ${pct(c.ratio)} (${c.hours} of ${c.available} h) · ${BAND[c.band].label}`}
              style={{ background: BAND[c.band].color, color: BAND[c.band].text }}>{c.ratio === null ? "" : Math.round(c.ratio * 100) + (BAND[c.band].icon ? " " + BAND[c.band].icon : "")}</div></td>)}</tr>)}
        </tbody></table>)}
    </div>
  );
}
