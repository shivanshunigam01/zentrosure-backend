/**
 * Certificate score: every checklist line counts equally toward /100.
 * Score = average(row quality) × 100, where each row’s quality is 0–1 (good/OK = 1, defects = reduced credit).
 * Row count N comes from the admin template (e.g. 140 lines → each line worth 100/N points if perfect).
 */

/** Fraction of this row's weight when inspector picks a negative / defect outcome (still “counts”, but low). */
const NEGATIVE_LINE_CREDIT = 0.5;

function inspectorCaptureMode(field) {
  const ft = String(field.fieldType || '')
    .trim()
    .toLowerCase();
  if (/text|textarea|input|number|numeric|string|^note$|notes|manual|free|comment|alphabet/.test(ft)) return 'text';
  if (/dropdown|drop\s*-?down|select|choice|choices|radio|list|pick|combo|multi/.test(ft)) return 'dropdown';
  if (/photo|image|capture|picture|camera|file|attachment/.test(ft)) return 'none';
  if (field.enableCondition !== false && Array.isArray(field.conditionOptions) && field.conditionOptions.length > 0) {
    return 'dropdown';
  }
  return 'none';
}

function normalizeToken(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Quality multiplier for one row in [0, 1]: 1 = full marks for that row's weight, NEGATIVE_LINE_CREDIT = partial.
 */
function outcomeFractionFromCondition(conditionStr, conditionOptions) {
  const raw = String(conditionStr || '').trim();
  if (!raw) return null;

  const opts = (conditionOptions || []).map((x) => String(x || '').trim()).filter(Boolean);
  const c = normalizeToken(raw);

  // NA — does not penalize
  if (/^(na|n\/a|not applicable|none)$/i.test(c)) return 1;

  // Explicit negative wording (matches common inspector labels)
  const negativeWord =
    /\b(nok|not\s*ok|not ok|fail|failed|bad|poor|reject|damaged|defect|major\b|minor\b)/i.test(raw) ||
    /\b(not\s*good|no\s*good)\b/i.test(raw);
  if (negativeWord) return NEGATIVE_LINE_CREDIT;

  // Explicit positive
  const positiveWord =
    /^(ok|pass|passed|yes|good|okay|perfect|excellent|great|fine|clear|satisfactory)$/i.test(c) ||
    /\b(ok|okay|good|perfect|pass|fine|clear|excellent|great|satisfactory)\b/i.test(raw);
  if (positiveWord) return 1;

  const lowerOpts = opts.map((o) => normalizeToken(o));
  const idx = lowerOpts.indexOf(c);
  if (idx >= 0) {
    const lab = opts[idx];
    const labN = normalizeToken(lab);
    if (/^(na|n\/a|not applicable)$/i.test(labN)) return 1;
    // First listed option is treated as the “best” (full marks) when not NA
    if (idx === 0) return 1;
    // Any other listed outcome = reduced marks (e.g. 2nd option NOT OK)
    return NEGATIVE_LINE_CREDIT;
  }

  // Unknown free text in condition — slight uncertainty
  if (/\b(ok|good|perfect|pass)\b/i.test(raw)) return 1;
  if (/\b(bad|fail|poor|damage|broken)\b/i.test(raw)) return NEGATIVE_LINE_CREDIT;
  return 0.85;
}

function outcomeFractionFromNotes(notesStr) {
  const t = String(notesStr || '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  const negative =
    /\b(not\s*good|not\s*ok|nok|fail|failed|bad|poor|damaged|broken|crack|reject|defect|major\s+issue|minor\s+issue)\b/i.test(
      lower,
    );
  const positive =
    /\b(ok|okay|good|perfect|pass|passed|fine|clear|excellent|great|satisfactory|healthy|no\s*damage)\b/i.test(lower);

  if (negative && !positive) return NEGATIVE_LINE_CREDIT;
  if (positive) return 1;
  // Neutral / descriptive — full credit when minimum evidence is present
  return 1;
}

/**
 * Combined [0,1] multiplier for the row after evidence requirements (photos, etc.).
 */
function rowQualityFraction(item, submittedRow) {
  if (!submittedRow) return 0;
  const mode = inspectorCaptureMode(item);
  const imgs = Array.isArray(submittedRow.images) ? submittedRow.images.length : 0;
  const minP = item.required ? Math.max(0, Number(item.minPhotos) || 0) : 0;
  if (imgs < minP) return 0;

  if (mode === 'text') {
    const notes = String(submittedRow.notes || '').trim();
    if (item.required && !notes) return 0;
    const q = outcomeFractionFromNotes(notes);
    return q == null ? 0 : q;
  }
  if (mode === 'dropdown') {
    const q = outcomeFractionFromCondition(submittedRow.condition, item.conditionOptions);
    return q == null ? 0 : q;
  }
  return 1;
}

function cloneField(f) {
  return typeof f === 'object' && f !== null ? { ...f } : f;
}

/**
 * Persist equal scoreWeight per row (100/N) for exports / legacy readers. Scoring uses the same rule in computeInspectionScore.
 */
function normalizeChecklistScoreWeights(fields) {
  if (!Array.isArray(fields) || !fields.length) return fields;
  const n = fields.length;
  const eq = 100 / n;
  const w = Math.round(eq * 10000) / 10000;
  return fields.map((f) => ({
    ...cloneField(f),
    scoreWeight: w,
  }));
}

function computeInspectionScore(checklist, submission) {
  const fields = Array.isArray(checklist) ? checklist : [];
  const n = fields.length;
  const subMap = new Map();
  for (const row of submission?.fields || []) {
    subMap.set(String(row.fieldId), row);
  }
  const breakdown = [];
  if (!n) {
    return { score: 0, breakdown };
  }
  const perRowMax = 100 / n;
  let earned = 0;
  for (const item of fields) {
    const sid = String(item.id || '');
    const sub = subMap.get(sid);
    const q = rowQualityFraction(item, sub);
    const e = perRowMax * q;
    earned += e;
    const pass = q >= 1 - 1e-9;
    breakdown.push({
      fieldId: sid,
      label: String(item.label || item.checklistTitle || sid).slice(0, 220),
      weight: Math.round(perRowMax * 100) / 100,
      earned: Math.round(e * 100) / 100,
      pass,
      condition: sub?.condition != null ? String(sub.condition) : '',
      qualityFraction: Math.round(q * 1000) / 1000,
    });
  }
  const score = Math.min(100, Math.round(earned * 100) / 100);
  return { score, breakdown };
}

/** @deprecated use rowQualityFraction — kept for callers expecting boolean pass/fail */
function fieldPassesScore(item, submittedRow) {
  return rowQualityFraction(item, submittedRow) >= 1 - 1e-9;
}

module.exports = {
  normalizeChecklistScoreWeights,
  computeInspectionScore,
  fieldPassesScore,
  inspectorCaptureMode,
  NEGATIVE_LINE_CREDIT,
};
