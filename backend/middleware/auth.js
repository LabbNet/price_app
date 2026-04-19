const jwt = require('jsonwebtoken');
const db = require('../db/knex');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — tokens will not verify');
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db('users').where({ id: payload.sub, is_active: true }).first();
    if (!user) return res.status(401).json({ error: 'user_not_found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

const STAFF_ROLES = ['admin', 'sales', 'legal', 'finance'];
const CLINIC_ROLES = ['clinic_admin', 'clinic_user'];

const requireStaff = requireRole(...STAFF_ROLES);
const requireClinic = requireRole(...CLINIC_ROLES);
const requireAdmin = requireRole('admin');

module.exports = {
  requireAuth,
  requireRole,
  requireStaff,
  requireClinic,
  requireAdmin,
  STAFF_ROLES,
  CLINIC_ROLES,
};
