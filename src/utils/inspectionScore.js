/**
 * Checklist score weights (sum to 100) + computed inspection score from inspector submission.
 */

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

function conditionCountsAsPass(conditionStr, conditionOptions) {
  const c = String(conditionStr || '')
    .trim()
    .toLowerCase();
  if (!c) return false;
  const opts = (conditionOptions || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
  if (opts.length && opts[0] === c) return true;
  if (/^(ok|pass|passed|yes|y|na|n\/a)$/.test(c)) return true;
  if (/^(nok|not ok|not\s*ok|fail|failed|no)$/.test(c)) return false;
  const idx = opts.indexOf(c);
  if (idx >= 0) return idx === 0;
  return false;
}

function fieldPassesScore(item, submittedRow) {
  if (!submittedRow) return false;
  const mode = inspectorCaptureMode(item);
  const imgs = Array.isArray(submittedRow.images) ? submittedRow.images.length : 0;
  const minP = item.required ? Math.max(0, Number(item.minPhotos) || 0) : 0;
  if (imgs < minP) return false;

  if (mode === 'text') {
    const notes = String(submittedRow.notes || '').trim();
    if (item.required && !notes) return false;
    return true;
  }
  if (mode === 'dropdown') {
    return conditionCountsAsPass(submittedRow.condition, item.conditionOptions);
  }
  return true;
}

function cloneField(f) {
  return typeof f === 'object' && f !== null ? { ...f } : f;
}

/**
 * Normalize scoreWeight on each row so weights sum to 100.
 * Empty weights share the remainder equally after explicit weights are applied.
 */
function normalizeChecklistScoreWeights(fields) {
  if (!Array.isArray(fields) || !fields.length) return fields;
  const n = fields.length;
  const parsed = fields.map((f) => {
    const v = f.scoreWeight;
    if (v == null || v === '') return { raw: null };
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) return { raw: null };
    return { raw: Math.min(100, num) };
  });
  const nullCount = parsed.filter((x) => x.raw == null).length;
  if (nullCount === n) {
    const eq = 100 / n;
    return fields.map((f) => ({
      ...cloneField(f),
      scoreWeight: Math.round(eq * 10000) / 10000,
    }));
  }
  const explicitSum = parsed.reduce((a, x) => a + (x.raw != null ? x.raw : 0), 0);
  const remainder = Math.max(0, 100 - explicitSum);
  const perNull = nullCount > 0 ? remainder / nullCount : 0;
  const adjusted = parsed.map((x) => (x.raw != null ? x.raw : perNull));
  const sum2 = adjusted.reduce((a, b) => a + b, 0);
  if (sum2 <= 0) {
    const eq = 100 / n;
    return fields.map((f) => ({
      ...cloneField(f),
      scoreWeight: Math.round(eq * 10000) / 10000,
    }));
  }
  return fields.map((f, i) => ({
    ...cloneField(f),
    scoreWeight: Math.round((adjusted[i] / sum2) * 10000) / 10000,
  }));
}

function computeInspectionScore(checklist, submission) {
  const fields = Array.isArray(checklist) ? checklist.map(cloneField) : [];
  const normalized = normalizeChecklistScoreWeights(fields);
  const subMap = new Map();
  for (const row of submission?.fields || []) {
    subMap.set(String(row.fieldId), row);
  }
  const breakdown = [];
  let earned = 0;
  for (const item of normalized) {
    const sid = String(item.id || '');
    const sub = subMap.get(sid);
    const w = Number(item.scoreWeight) || 0;
    const pass = fieldPassesScore(item, sub);
    const e = pass ? w : 0;
    earned += e;
    breakdown.push({
      fieldId: sid,
      label: String(item.label || item.checklistTitle || sid).slice(0, 220),
      weight: Math.round(w * 100) / 100,
      earned: Math.round(e * 100) / 100,
      pass,
      condition: sub?.condition != null ? String(sub.condition) : '',
    });
  }
  const score = Math.min(100, Math.round(earned * 100) / 100);
  return { score, breakdown };
}

module.exports = {
  normalizeChecklistScoreWeights,
  computeInspectionScore,
  fieldPassesScore,
  inspectorCaptureMode,
};
