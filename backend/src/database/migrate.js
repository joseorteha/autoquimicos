const fs = require('fs');
const path = require('path');
const db = require('./connection');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await db.query(schema);
    logger.info('Schema created successfully');
    
    // Read and execute seed data
    const seedPath = path.join(__dirname, 'seed.sql');
    const seedData = fs.readFileSync(seedPath, 'utf8');
    
    await db.query(seedData);
    logger.info('Seed data inserted successfully');
    
    logger.info('Database migrations completed successfully');
    
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
