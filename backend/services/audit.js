const db = require('../db/knex');

/**
 * Record a mutation in audit_log. Fire-and-log on failure — an audit failure
 * should not break the user's request, but we do want to know about it.
 */
async function audit({ req, action, entityType, entityId, before = null, after = null, notes = null }) {
  try {
    await db('audit_log').insert({
      actor_id: req?.user?.id || null,
      actor_email: req?.user?.email || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_state: before,
      after_state: after,
      ip_address: req?.ip || null,
      notes,
    });
  } catch (err) {
    console.error('[audit] failed to record', { action, entityType, entityId, err: err.message });
  }
}

module.exports = { audit };
