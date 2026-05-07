const ApiError = require('./apiError');

/** Booking states where replacing the checklist would corrupt published / verified records. */
const BLOCK_CHECKLIST_REPLACE = new Set(['Verified', 'Report Published', 'Cancelled']);

/**
 * Throw when checklist must not be replaced (admin Excel apply or PATCH checklist).
 */
function assertBookingAllowsChecklistReplace(booking) {
  const st = String(booking.status || '');
  if (BLOCK_CHECKLIST_REPLACE.has(st)) {
    throw new ApiError(
      409,
      `Cannot replace checklist while booking status is "${st}"`,
      'INVALID_TRANSITION',
    );
  }
}

function allowedFieldIds(newFields) {
  const ids = new Set();
  for (const f of newFields || []) {
    const id = f && f.id != null ? String(f.id).trim() : '';
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * After checklist rows change, drop submission rows / photos that no longer match field ids.
 * Optionally rolls back status when a submitted inspection no longer applies.
 */
function syncSubmissionAndArtifactsAfterChecklistChange(booking, newFields, meta = {}) {
  const allowedIds = allowedFieldIds(newFields);

  const sub = booking.submission;
  if (sub && Array.isArray(sub.fields) && sub.fields.length) {
    const kept = sub.fields.filter((s) => allowedIds.has(String(s.fieldId || '').trim()));
    if (kept.length === sub.fields.length) {
      // submission still valid for new checklist
    } else if (!kept.length) {
      booking.submission = undefined;
      booking.markModified('submission');
      booking.history.push({
        event: 'Inspection submission cleared — checklist changed',
        meta: { ...meta, droppedFields: sub.fields.length },
      });
      rollbackStatusAfterSubmissionCleared(booking);
    } else {
      sub.fields = kept;
      booking.markModified('submission');
      booking.history.push({
        event: 'Inspection submission trimmed — checklist changed',
        meta: { ...meta, kept: kept.length, dropped: sub.fields.length - kept.length },
      });
    }
  }

  if (Array.isArray(booking.uploadedImages) && booking.uploadedImages.length) {
    const before = booking.uploadedImages.length;
    booking.uploadedImages = booking.uploadedImages.filter((im) => {
      const fid = im && im.fieldId != null ? String(im.fieldId).trim() : '';
      if (!fid) return true;
      return allowedIds.has(fid);
    });
    if (booking.uploadedImages.length !== before) {
      booking.markModified('uploadedImages');
      booking.history.push({
        event: 'Orphan inspector photos removed — checklist changed',
        meta: { ...meta, removed: before - booking.uploadedImages.length },
      });
    }
  }
}

function rollbackStatusAfterSubmissionCleared(booking) {
  if (booking.status === 'Submitted for Review') {
    const next = booking.inspectorId ? 'Assigned' : 'Awaiting Inspector';
    booking.status = next;
    booking.history.push({
      event: 'Booking moved back for re-inspection after checklist change',
      meta: { nextStatus: next },
    });
  }
}

module.exports = {
  assertBookingAllowsChecklistReplace,
  syncSubmissionAndArtifactsAfterChecklistChange,
};
