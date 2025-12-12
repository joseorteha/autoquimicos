const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'gestion_salas',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Test connection
pool.getConnection()
  .then(connection => {
    logger.info('Connected to MySQL database');
    connection.release();
  })
  .catch(err => {
    logger.error('MySQL connection error:', err);
    process.exit(-1);
  });

module.exports = {
  query: async (sql, params = []) => {
    try {
      const [rows] = await pool.execute(sql, params);
      return { rows };
    } catch (error) {
      logger.error('Database query error:', error);
      throw error;
    }
  },
  getConnection: () => pool.getConnection(),
  pool
};
