const express = require('express');
const db = require('../db/knex');

const router = express.Router();

router.get('/', async (req, res) => {
  let database = 'ok';
  try {
    await db.raw('select 1');
  } catch (e) {
    database = 'error';
  }
  res.json({ status: 'ok', database, time: new Date().toISOString() });
});

module.exports = router;
