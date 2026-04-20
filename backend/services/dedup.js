const db = require('../db/knex');

/**
 * Account dedup helpers.
 *
 *   - `normalizeField(val)` — lowercases, strips punctuation, collapses
 *     whitespace, and expands the common street-type abbreviations so
 *     "123 Main St." and "123 MAIN STREET" compare equal.
 *   - `scoreMatch(a, b)` — counts how many of the four address fields
 *     (address_line1, city, state, postal_code) match exactly after
 *     normalization. Returns 0..4.
 *   - `findDuplicates({ ...address, excludeId })` — returns every
 *     existing clinic whose normalized address lines up with the given
 *     one on 3 or 4 of 4 fields. Skips inactive rows and the optional
 *     excludeId (used on update to avoid matching the record itself).
 *   - `processNewOrUpdated(clinicId)` — called after a create or an
 *     address-changing update. On a 4/4 match, deletes the newer
 *     matching record(s). On a 3/4 match, enqueues a pair in
 *     duplicate_review_queue (if not already present).
 *     Returns { deleted: [ids], queued: [pairs] }.
 */

const ABBREVIATIONS = new Map([
  ['street', 'st'], ['st', 'st'],
  ['avenue', 'ave'], ['ave', 'ave'], ['av', 'ave'],
  ['boulevard', 'blvd'], ['blvd', 'blvd'],
  ['road', 'rd'], ['rd', 'rd'],
  ['drive', 'dr'], ['dr', 'dr'],
  ['lane', 'ln'], ['ln', 'ln'],
  ['court', 'ct'], ['ct', 'ct'],
  ['parkway', 'pkwy'], ['pkwy', 'pkwy'],
  ['highway', 'hwy'], ['hwy', 'hwy'],
  ['place', 'pl'], ['pl', 'pl'],
  ['circle', 'cir'], ['cir', 'cir'],
  ['terrace', 'ter'], ['ter', 'ter'],
  ['suite', 'ste'], ['ste', 'ste'],
  ['apartment', 'apt'], ['apt', 'apt'],
  ['north', 'n'], ['n', 'n'],
  ['south', 's'], ['s', 's'],
  ['east', 'e'], ['e', 'e'],
  ['west', 'w'], ['w', 'w'],
]);

function normalizeField(val) {
  if (val == null) return '';
  const s = String(val)
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s
    .split(' ')
    .map((tok) => ABBREVIATIONS.get(tok) || tok)
    .join(' ');
}

function normalizeAddress(row) {
  return {
    line: normalizeField(row.address_line1),
    city: normalizeField(row.city),
    state: normalizeField(row.state),
    zip: normalizeField(row.postal_code),
  };
}

function scoreMatch(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  let score = 0;
  // Empty fields don't count toward a match (prevents blank-addr collisions)
  if (na.line && na.line === nb.line) score++;
  if (na.city && na.city === nb.city) score++;
  if (na.state && na.state === nb.state) score++;
  if (na.zip && na.zip === nb.zip) score++;
  return score;
}

async function findDuplicates({ address_line1, city, state, postal_code, excludeId = null }) {
  const candidate = { address_line1, city, state, postal_code };
  const norm = normalizeAddress(candidate);
  // A record is worth comparing if it shares any of the four fields — this
  // cuts the scan down to likely candidates without pulling the whole table.
  const q = db('clinics')
    .where({ is_active: true })
    .andWhere((w) => {
      if (norm.line)  w.orWhereRaw('LOWER(address_line1) LIKE ?', `%${norm.line.split(' ')[0]}%`);
      if (norm.zip)   w.orWhere('postal_code', postal_code);
      if (norm.city && norm.state) {
        w.orWhere((q2) => q2.whereRaw('LOWER(city) = ?', norm.city).whereRaw('LOWER(state) = ?', norm.state));
      }
    });
  if (excludeId) q.andWhereNot('id', excludeId);

  const rows = await q;
  const matches = [];
  for (const r of rows) {
    const score = scoreMatch(candidate, r);
    if (score >= 3) matches.push({ clinic: r, score });
  }
  matches.sort((a, b) => b.score - a.score || new Date(a.clinic.created_at) - new Date(b.clinic.created_at));
  return matches;
}

async function processNewOrUpdated(clinicId, { trx = db, actorId = null } = {}) {
  const subject = await trx('clinics').where({ id: clinicId }).first();
  if (!subject) return { deleted: [], queued: [] };

  const candidates = await findDuplicates({
    address_line1: subject.address_line1,
    city: subject.city,
    state: subject.state,
    postal_code: subject.postal_code,
    excludeId: subject.id,
  });

  const deleted = [];
  const queued = [];

  for (const { clinic: other, score } of candidates) {
    if (score === 4) {
      // Exact match on all four fields → delete the newer of the two.
      const subjectDate = new Date(subject.created_at);
      const otherDate = new Date(other.created_at);
      const toDeleteId = subjectDate > otherDate ? subject.id : other.id;
      await trx('clinics').where({ id: toDeleteId }).del();
      deleted.push(toDeleteId);
      // If we deleted the subject, we're done looping against it.
      if (toDeleteId === subject.id) break;
    } else {
      // Partial match (3/4) → enqueue for manual review. clinic_a is the
      // older record (kept by default), clinic_b is the newer.
      const aIsOlder = new Date(subject.created_at) <= new Date(other.created_at);
      const [a, b] = aIsOlder ? [subject, other] : [other, subject];

      const existing = await trx('duplicate_review_queue')
        .where((w) => w
          .where({ clinic_a_id: a.id, clinic_b_id: b.id })
          .orWhere({ clinic_a_id: b.id, clinic_b_id: a.id }))
        .first();
      if (existing) continue;

      const [row] = await trx('duplicate_review_queue')
        .insert({ clinic_a_id: a.id, clinic_b_id: b.id, match_score: score })
        .returning('id');
      queued.push({ id: row.id, clinic_a_id: a.id, clinic_b_id: b.id, match_score: score });
    }
  }

  return { deleted, queued };
}

module.exports = {
  normalizeField,
  normalizeAddress,
  scoreMatch,
  findDuplicates,
  processNewOrUpdated,
};
