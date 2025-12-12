const db = require('../database/connection');
const logger = require('../utils/logger');

class AuditService {
  async logAction(tableName, recordId, action, oldValues = null, newValues = null, userId = null, req = null) {
    try {
      const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
      const userAgent = req ? req.get('User-Agent') : null;

      const query = `
        INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, user_id, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const result = await db.query(query, [
        tableName,
        recordId,
        action,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        userId,
        ipAddress,
        userAgent
      ]);

      logger.info(`Audit log created: ${action} on ${tableName}:${recordId} by user:${userId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Audit log error:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  async logUserAction(action, userId, oldValues = null, newValues = null, req = null) {
    return this.logAction('users', userId, action, oldValues, newValues, userId, req);
  }

  async logRoomAction(action, roomId, userId, oldValues = null, newValues = null, req = null) {
    return this.logAction('rooms', roomId, action, oldValues, newValues, userId, req);
  }

  async logReservationAction(action, reservationId, userId, oldValues = null, newValues = null, req = null) {
    return this.logAction('reservations', reservationId, action, oldValues, newValues, userId, req);
  }

  async getAuditLogs(filters = {}) {
    try {
      let query = `
        SELECT 
          al.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 0;

      if (filters.tableName) {
        paramCount++;
        query += ` AND al.table_name = $${paramCount}`;
        params.push(filters.tableName);
      }

      if (filters.recordId) {
        paramCount++;
        query += ` AND al.record_id = $${paramCount}`;
        params.push(filters.recordId);
      }

      if (filters.action) {
        paramCount++;
        query += ` AND al.action = $${paramCount}`;
        params.push(filters.action);
      }

      if (filters.userId) {
        paramCount++;
        query += ` AND al.user_id = $${paramCount}`;
        params.push(filters.userId);
      }

      if (filters.startDate) {
        paramCount++;
        query += ` AND DATE(al.created_at) >= $${paramCount}`;
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        paramCount++;
        query += ` AND DATE(al.created_at) <= $${paramCount}`;
        params.push(filters.endDate);
      }

      query += ` ORDER BY al.created_at DESC`;

      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(filters.limit);
      }

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Get audit logs error:', error);
      throw error;
    }
  }

  async getReservationAuditTrail(reservationId) {
    try {
      const query = `
        SELECT 
          al.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.table_name = 'reservations' AND al.record_id = $1
        ORDER BY al.created_at ASC
      `;

      const result = await db.query(query, [reservationId]);
      return result.rows;
    } catch (error) {
      logger.error('Get reservation audit trail error:', error);
      throw error;
    }
  }

  async getUserActivitySummary(userId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          al.action,
          al.table_name,
          COUNT(*) as action_count,
          MAX(al.created_at) as last_action
        FROM audit_log al
        WHERE al.user_id = $1
        AND DATE(al.created_at) BETWEEN $2 AND $3
        GROUP BY al.action, al.table_name
        ORDER BY action_count DESC
      `;

      const result = await db.query(query, [userId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Get user activity summary error:', error);
      throw error;
    }
  }

  async getSystemActivitySummary(startDate, endDate) {
    try {
      const query = `
        SELECT 
          al.action,
          al.table_name,
          COUNT(*) as action_count,
          COUNT(DISTINCT al.user_id) as unique_users,
          MAX(al.created_at) as last_action
        FROM audit_log al
        WHERE DATE(al.created_at) BETWEEN $1 AND $2
        GROUP BY al.action, al.table_name
        ORDER BY action_count DESC
      `;

      const result = await db.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Get system activity summary error:', error);
      throw error;
    }
  }

  async getMostActiveUsers(startDate, endDate, limit = 10) {
    try {
      const query = `
        SELECT 
          u.first_name || ' ' || u.last_name as user_name,
          u.email,
          u.role,
          u.department,
          COUNT(al.id) as total_actions,
          MAX(al.created_at) as last_activity
        FROM audit_log al
        JOIN users u ON al.user_id = u.id
        WHERE DATE(al.created_at) BETWEEN $1 AND $2
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.department
        ORDER BY total_actions DESC
        LIMIT $3
      `;

      const result = await db.query(query, [startDate, endDate, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Get most active users error:', error);
      throw error;
    }
  }

  async getFailedLoginAttempts(startDate, endDate) {
    try {
      const query = `
        SELECT 
          al.ip_address,
          al.user_agent,
          COUNT(*) as attempt_count,
          MAX(al.created_at) as last_attempt,
          array_agg(DISTINCT al.new_values->>'email') as attempted_emails
        FROM audit_log al
        WHERE al.table_name = 'users' 
        AND al.action = 'login_failed'
        AND DATE(al.created_at) BETWEEN $1 AND $2
        GROUP BY al.ip_address, al.user_agent
        ORDER BY attempt_count DESC
      `;

      const result = await db.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Get failed login attempts error:', error);
      throw error;
    }
  }

  // Middleware to automatically log changes
  createAuditMiddleware(tableName) {
    return async (req, res, next) => {
      const originalSend = res.send;
      const originalJson = res.json;

      // Store original data for comparison
      req.auditData = {
        tableName,
        action: this.getActionFromMethod(req.method, req.route?.path),
        recordId: req.params.id,
        userId: req.user?.id,
        oldValues: null
      };

      // If it's an update operation, get the current data
      if (req.method === 'PUT' || req.method === 'PATCH') {
        try {
          // This would need to be customized based on your models
          // For now, we'll just store the request body as new values
          req.auditData.newValues = req.body;
        } catch (error) {
          logger.error('Error getting old values for audit:', error);
        }
      }

      // Override response methods to capture the result
      res.send = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Success response, log the action
          auditService.logAction(
            req.auditData.tableName,
            req.auditData.recordId,
            req.auditData.action,
            req.auditData.oldValues,
            req.auditData.newValues,
            req.auditData.userId,
            req
          );
        }
        originalSend.call(this, data);
      };

      res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Success response, log the action
          auditService.logAction(
            req.auditData.tableName,
            req.auditData.recordId,
            req.auditData.action,
            req.auditData.oldValues,
            req.auditData.newValues,
            req.auditData.userId,
            req
          );
        }
        originalJson.call(this, data);
      };

      next();
    };
  }

  getActionFromMethod(method, path) {
    switch (method) {
      case 'POST':
        if (path?.includes('approve')) return 'approve';
        if (path?.includes('reject')) return 'reject';
        if (path?.includes('cancel')) return 'cancel';
        if (path?.includes('checkin')) return 'checkin';
        if (path?.includes('noshow')) return 'noshow';
        return 'create';
      case 'PUT':
      case 'PATCH':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return 'unknown';
    }
  }
}

const auditService = new AuditService();
module.exports = auditService;
