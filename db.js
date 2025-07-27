const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

const db = pool.promise();

db.query('SELECT 1')
  .then(() => console.log('Połączenie z bazą działa!'))
  .catch(err => console.error('Błąd połączenia z bazą:', err));

module.exports = db;
