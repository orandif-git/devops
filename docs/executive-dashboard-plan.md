# Executive Dashboard – approach

Prototype: `prototypes/executive-dashboard.html` (screenshots next to it). Sample data, built-in question matcher, no AI.

## Where it lives
A **separate hub page ("Executive Dashboard") inside the Resource Planner extension**, with its own menu item under Boards. Not a separate extension, because:
- extension data (field mappings, capacity teams, thresholds) belongs to one extension, so a second extension would have to be set up again;
- the first-load cache is per extension (per origin), so a second extension would read every Epic again;
- one package, one version, one install; the planner's read-only scopes (`vso.work`, `vso.project`) already cover it.
A later Copilot / LLM connector, if wanted, ships as a **separate optional extension** so the planner keeps its "read-only, nothing leaves Azure DevOps" promise.

## What it shows
Portfolio list of every Epic with a status (on track / needs attention / at risk / not started / done), the reason, progress against time used, go-live date, forecast finish and a delivery confidence; category breakdown; a brief (progressing well / needs attention / go-live risk); an "ask" box that turns a question into filters and a sentence built from the data.

## Status rules (computed, configurable)
- **Done**: state is done. **Not started**: state New, or start date in the future.
- **At risk (red)**: past go-live and not done; or forecast finish more than 30 days after go-live; or progress more than 25 points behind the share of time used.
- **Needs attention (amber)**: on hold; or forecast 8–30 days late; or progress 10–25 points behind; or people booked over capacity on the Epic.
- **On track (green)**: otherwise.
- Forecast finish = start + time used / progress (needs progress > 0 and at least 25 % of the time used). Confidence = 97 minus penalties for slip, progress gap, over-capacity people and hold. All thresholds will be settings.

## Needs from settings (to confirm)
Category field (or tag / area path) for "Regulatory", "Software upgrade" etc.; the progress source (percent-complete field, share of child items done, remaining versus completed work, or grid hours); the go-live date field (the planner's target-date field by default).

## Later (not now)
Copilot / LLM: the model only turns a question into filters and writes the narrative; every number stays computed by code. Options: endpoint under your control with a server-side relay, a Copilot Studio / declarative agent over a read-only feed, or a scheduled snapshot Copilot can read. Needs your security team's approval because project data would leave Azure DevOps.
