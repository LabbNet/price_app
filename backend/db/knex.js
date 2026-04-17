const knex = require('knex');
const config = require('../knexfile');

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const db = knex(config[env]);

module.exports = db;
