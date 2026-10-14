// The "NFR Risk Assessment" grid: weighted yes/no questions in categories, a rating per category and an overall rating.
// build(options) returns the pieces to merge into a project configuration: { grid, lookups, calculations }.
// Everything a person may want to change (questions, weights, answers that score, rating limits, Epic field names) is in the options.

const CATEGORIES = {
  "Business Resilience": [
    ["Does the project introduce new technology or result in major system-level changes?", 5],
    ["Based on the BRD are there any identified components or processes without redundancy or backup that could impact business continuity during a crisis?", 10],
    ["Will the project require vendor development?", 20],
    ["Will the project have any impact on / and involves updates/changes /or enhancements on critical systems?", 20],
  ],
  "Customer Impact": [
    ["What is the impact of the project on customers? Refer to the Classification sheet for details.", 20, { answers: ["High", "Medium", "Low", "NA", "Pending Validation"] }],
    ["Will the project directly affect any customer-facing channels such as the mobile app ATMs contact center or internet banking?", 15],
    ["Will the project significantly redesign or impact the digital customer journey or user interface/user experience (UI/UX)?", 15],
    ["Could the project temporarily remove limit or alter features in a way that affects how customers interact with or perceive their relationship with the bank?", 15],
    ["Will the project impact services directly utilized by retail or corporate customers?", 5],
    ["Will the project directly or indirectly change enhance or reduce any existing process or BAU?", 15],
  ],
  "Data Privacy / InfoSec": [
    ["Does the project involve storing processing or transmitting restricted or confidential data?", 20],
    ["Will the project be hosted fully or partially on cloud infrastructure?", 5],
    ["Will the project be integrated with external systems vendors or APIs that could expose internal systems to cyber threats?", 15],
    ["Does the project involve anything that would bring it under PCI DSS rules like handling or storing cardholder data?", 20],
    ["Does the project include the required updates or integrations with security monitoring and alerting systems (e.g. SIEM) needed for go-live?", 20],
  ],
  "Financial & Fraud Impact": [
    ["At any stage of the project could a failure lead to financial loss regulatory penalties or missed revenue opportunities?", 0],
    ["Does the project introduce a risk of internal fraud or misuse of data?", 10],
    ["Does the project introduce a risk of external fraud or misuse of data?", 10],
  ],
  "Regulatory Impact": [
    ["Does the project introduce any new regulatory legal or compliance obligations (e.g. QCB GDPR AML/CFT QFC QFCMA NCSA PDPPL etc)?", 5],
    ["Will the project result in any changes to existing regulatory reports disclosures or data submission requirements?", 20],
    ["Is there a risk that regulatory expectations may change during or shortly after the project’s implementation?", 5],
    ["Does the project have a potential regulatory impact? Refer to the Classification sheet for details.", 0],
  ],
  "Reputational & Ecosystem Impact": [
    ["Will the project affect any high-profile clients government entities or strategic partnerships that could result in reputational damage if mishandled?", 10],
    ["Could failure or delay in project implementation result in reputational risk to the bank?", 0],
    ["Will the project involve changes to customer terms & conditions or data usage policies?", 5],
  ],
};

const DEFAULTS = {
  gridName: "NFR Risk Assessment",
  mappingName: "NFR question weights",
  categories: CATEGORIES,
  /** answers every question offers unless it has its own list */
  answers: ["Yes", "No", "NA", "Pending Validation"],
  /** answers that earn the question's weight */
  scoringAnswers: ["Yes", "Pending Validation", "High"],
  /** rating limits as a share of the maximum score: up to `low` = Low, up to `moderate` = Moderate, up to `moderateHigh` = Moderate High, above = High */
  limits: { low: 0.5, moderate: 0.625, moderateHigh: 0.8 },
  /** Epic fields written by the calculations (change them to fields you have) */
  fields: { scorePercent: "Custom.NFRRiskScorePercent", rating: "Custom.NFRRiskAssessment", action: "Custom.IFRMAction" },
  /** what the IFRM action says for a Low rating and for any other rating */
  actionLow: "Out of NFR Scope",
  actionOther: "Full Risk Assessment",
  workItemTypes: ["Epic"],
};

const ratingFormula = (v, l) => `IF(${v} <= ${l.low}, "Low", IF(${v} <= ${l.moderate}, "Moderate", IF(${v} <= ${l.moderateHigh}, "Moderate High", "High")))`;

function build(options = {}) {
  const o = { ...DEFAULTS, ...options, limits: { ...DEFAULTS.limits, ...(options.limits || {}) }, fields: { ...DEFAULTS.fields, ...(options.fields || {}) } };
  const cats = Object.keys(o.categories);
  const questions = cats.flatMap(c => o.categories[c].map(q => ({ category: c, text: q[0], weight: q[1], answers: (q[2] && q[2].answers) || o.answers })));
  const scoring = o.scoringAnswers.map(a => `answer = "${a}"`);
  const pct = o.limits;
  const band = n => Math.round(n * 1000) / 10;

  const grid = {
    columns: [
      { id: "classification", name: "Material Classification", type: "dropdown", required: true, options: cats },
      { id: "questions", name: "Classification Questionnaire", type: "dropdown", dependsOn: { column: "classification", map: Object.fromEntries(cats.map(c => [c, o.categories[c].map(q => q[0])])) }, width: 380 },
      { id: "answer", name: "Answer", type: "dropdown", dependsOn: { column: "questions", map: Object.fromEntries(questions.map(q => [q.text, q.answers])) } },
      { id: "justification", name: "Justification", type: "string", width: 260 },
      { id: "weight", name: "Question weight", type: "number", lookup: { column: "questions", map: {}, table: o.mappingName }, total: "sum" },
      { id: "scored", name: "Scored weight", type: "calculated", formula: `IF(OR(${scoring.join(", ")}), weight, 0)`, decimals: 0, onEmpty: "blank", total: "sum" },
      { id: "categorypct", name: "Category score %", type: "calculated", formula: "GROUPTOTAL(scored, classification) / GROUPTOTAL(weight, classification) * 100", decimals: 1, onEmpty: "zero", onDivZero: "blank", colorBy: "assessment" },
      { id: "assessment", name: "Assessment", type: "string", statusBands: { source: "categorypct", ranges: [
        { upTo: band(pct.low), label: "Low", color: "green" }, { upTo: band(pct.moderate), label: "Moderate", color: "yellow" },
        { upTo: band(pct.moderateHigh), label: "Moderate High", color: "orange" }, { upTo: null, label: "High", color: "red" } ] } },
    ],
    totals: [],
    blockSave: true,
  };

  const lookups = { [o.mappingName]: { map: Object.fromEntries(questions.map(q => [q.text, String(q.weight)])), description: "Weight of each NFR classification question" } };
  const inputs = [
    { name: "ScoredWeight", source: { kind: "grid", grid: o.gridName, column: "scored", aggregate: "sum", where: [] }, onEmpty: "blank" },
    { name: "TotalWeight", source: { kind: "grid", grid: o.gridName, column: "weight", aggregate: "sum", where: [] }, onEmpty: "blank" },
  ];
  const common = { enabled: true, workItemTypes: o.workItemTypes, onEmpty: "blank", onDivZero: "blank", mode: "always" };
  const calculations = [
    { id: "nfr-score-pct", name: "NFR overall score %", ...common, inputs, formula: "IF(TotalWeight = 0, 0, ScoredWeight / TotalWeight * 100)", resultField: o.fields.scorePercent, decimals: 1 },
    { id: "nfr-rating", name: "NFR overall rating", ...common, inputs, formula: `IF(TotalWeight = 0, "", ${ratingFormula("ScoredWeight / TotalWeight", pct)})`, resultField: o.fields.rating, decimals: 2 },
    { id: "nfr-action", name: "NFR IFRM action", ...common, inputs: [{ name: "Rating", source: { kind: "field", field: o.fields.rating }, onEmpty: "blank" }],
      formula: `IF(Rating = "", "", IF(Rating = "Low", "${o.actionLow}", "${o.actionOther}"))`, resultField: o.fields.action, decimals: 2 },
  ];
  return { gridName: o.gridName, grid, lookups, calculations, questions };
}

/** Put the pieces into a project configuration. The grid keeps what the existing grid of that name already has (data field, review, schedule, …) and its existing column ids, so rows already filled in stay valid. Nothing else is touched. */
function merge(config, built) {
  const out = JSON.parse(JSON.stringify(config));
  out.grids = out.grids || {};
  const existing = out.grids[built.gridName];
  const keep = existing ? Object.fromEntries(Object.entries(existing).filter(([k]) => !["columns", "totals"].includes(k))) : {};
  out.grids[built.gridName] = { ...built.grid, ...keep, columns: built.grid.columns, totals: (existing && existing.totals) || built.grid.totals };
  out.lookups = { ...(out.lookups || {}), ...built.lookups };
  const calcs = Array.isArray(out.calculations) ? out.calculations : [];
  for (const c of built.calculations) { const i = calcs.findIndex(x => x.id === c.id); if (i >= 0) calcs[i] = c; else calcs.push(c); }
  out.calculations = calcs;
  return out;
}

module.exports = { build, merge, DEFAULTS };
