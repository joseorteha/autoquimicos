const express = require('express');
const auditService = require('../services/auditService');
const { authenticateToken, requireApprover } = require('../middleware/auth');
const { validateUUID, validateDateRange } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Get audit logs (Admin and Approver only)
router.get('/', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { tableName, recordId, action, userId, startDate, endDate, limit = 100 } = req.query;

    const filters = {};
    if (tableName) filters.tableName = tableName;
    if (recordId) filters.recordId = recordId;
    if (action) filters.action = action;
    if (userId) filters.userId = userId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (limit) filters.limit = parseInt(limit);

    const auditLogs = await auditService.getAuditLogs(filters);

    res.json({
      success: true,
      count: auditLogs.length,
      filters,
      logs: auditLogs
    });

  } catch (error) {
    logger.error('Get audit logs error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener los registros de auditoría'
    });
  }
});

// Get audit trail for a specific reservation
router.get('/reservation/:id', authenticateToken, requireApprover, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await auditService.getReservationAuditTrail(id);

    res.json({
      success: true,
      reservationId: id,
      count: auditTrail.length,
      auditTrail
    });

  } catch (error) {
    logger.error('Get reservation audit trail error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el historial de auditoría de la reserva'
    });
  }
});

// Get user activity summary
router.get('/user/:id/activity', authenticateToken, requireApprover, validateUUID, validateDateRange, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const activitySummary = await auditService.getUserActivitySummary(id, startDate, endDate);

    res.json({
      success: true,
      userId: id,
      period: {
        startDate,
        endDate
      },
      activitySummary
    });

  } catch (error) {
    logger.error('Get user activity summary error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el resumen de actividad del usuario'
    });
  }
});

// Get system activity summary
router.get('/system/activity', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const systemActivity = await auditService.getSystemActivitySummary(startDate, endDate);

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      systemActivity
    });

  } catch (error) {
    logger.error('Get system activity summary error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el resumen de actividad del sistema'
    });
  }
});

// Get most active users
router.get('/users/most-active', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const mostActiveUsers = await auditService.getMostActiveUsers(startDate, endDate, parseInt(limit));

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      limit: parseInt(limit),
      mostActiveUsers
    });

  } catch (error) {
    logger.error('Get most active users error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener los usuarios más activos'
    });
  }
});

// Get failed login attempts
router.get('/security/failed-logins', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const failedAttempts = await auditService.getFailedLoginAttempts(startDate, endDate);

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      failedLoginAttempts: failedAttempts
    });

  } catch (error) {
    logger.error('Get failed login attempts error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener los intentos de login fallidos'
    });
  }
});

// Get audit statistics
router.get('/stats', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    // Get various statistics
    const [systemActivity, mostActiveUsers, failedAttempts] = await Promise.all([
      auditService.getSystemActivitySummary(startDate, endDate),
      auditService.getMostActiveUsers(startDate, endDate, 5),
      auditService.getFailedLoginAttempts(startDate, endDate)
    ]);

    // Calculate totals
    const totalActions = systemActivity.reduce((sum, item) => sum + parseInt(item.action_count), 0);
    const totalUsers = new Set(systemActivity.map(item => item.unique_users)).size;
    const totalFailedLogins = failedAttempts.reduce((sum, item) => sum + parseInt(item.attempt_count), 0);

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      statistics: {
        totalActions,
        totalUsers,
        totalFailedLogins,
        actionBreakdown: systemActivity,
        topUsers: mostActiveUsers,
        securityAlerts: failedAttempts.length
      }
    });

  } catch (error) {
    logger.error('Get audit statistics error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener las estadísticas de auditoría'
    });
  }
});

module.exports = router;
