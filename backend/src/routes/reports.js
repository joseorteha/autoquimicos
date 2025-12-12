const express = require('express');
const db = require('../database/connection');
const { authenticateToken, requireApprover } = require('../middleware/auth');
const { validateDateRange } = require('../middleware/validation');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Get reservations summary report
router.get('/reservations/summary', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate, roomId, department } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    let query = `
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(CASE WHEN status = 'pendiente' THEN 1 END) as pending_reservations,
        COUNT(CASE WHEN status = 'aprobada' THEN 1 END) as approved_reservations,
        COUNT(CASE WHEN status = 'rechazada' THEN 1 END) as rejected_reservations,
        COUNT(CASE WHEN status = 'cancelada' THEN 1 END) as cancelled_reservations,
        COUNT(CASE WHEN status = 'completada' THEN 1 END) as completed_reservations,
        COUNT(CASE WHEN no_show = true THEN 1 END) as no_shows,
        COUNT(CASE WHEN coffee_break = 'solicitado' THEN 1 END) as coffee_break_requests,
        AVG(attendees_count) as avg_attendees,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as avg_duration_hours,
        SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as total_hours_reserved
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN rooms room ON r.room_id = room.id
      WHERE DATE(r.start_time) BETWEEN $1 AND $2
    `;

    const params = [startDate, endDate];
    let paramCount = 2;

    if (roomId) {
      paramCount++;
      query += ` AND r.room_id = $${paramCount}`;
      params.push(roomId);
    }

    if (department) {
      paramCount++;
      query += ` AND u.department ILIKE $${paramCount}`;
      params.push(`%${department}%`);
    }

    const result = await db.query(query, params);
    const summary = result.rows[0];

    // Convert string numbers to integers/floats
    Object.keys(summary).forEach(key => {
      if (key.includes('avg_') || key.includes('total_hours')) {
        summary[key] = parseFloat(summary[key]) || 0;
      } else {
        summary[key] = parseInt(summary[key]) || 0;
      }
    });

    // Calculate additional metrics
    summary.approval_rate = summary.total_reservations > 0 ? 
      ((summary.approved_reservations + summary.completed_reservations) / summary.total_reservations * 100).toFixed(2) : 0;
    
    summary.completion_rate = summary.approved_reservations > 0 ? 
      (summary.completed_reservations / summary.approved_reservations * 100).toFixed(2) : 0;
    
    summary.no_show_rate = summary.approved_reservations > 0 ? 
      (summary.no_shows / summary.approved_reservations * 100).toFixed(2) : 0;

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      filters: {
        roomId: roomId || 'all',
        department: department || 'all'
      },
      summary
    });

  } catch (error) {
    logger.error('Get reservations summary error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el reporte de resumen de reservas'
    });
  }
});

// Get room utilization report
router.get('/rooms/utilization', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const query = `
      SELECT 
        room.id,
        room.name,
        room.capacity,
        room.location,
        COUNT(r.id) as total_reservations,
        COUNT(CASE WHEN r.status = 'completada' THEN 1 END) as completed_reservations,
        COUNT(CASE WHEN r.no_show = true THEN 1 END) as no_shows,
        AVG(r.attendees_count) as avg_attendees,
        AVG(EXTRACT(EPOCH FROM (r.end_time - r.start_time))/3600) as avg_duration_hours,
        SUM(EXTRACT(EPOCH FROM (r.end_time - r.start_time))/3600) as total_hours_used,
        MAX(r.attendees_count) as max_attendees_used
      FROM rooms room
      LEFT JOIN reservations r ON room.id = r.room_id 
        AND DATE(r.start_time) BETWEEN $1 AND $2
        AND r.status != 'cancelada'
      WHERE room.is_active = true
      GROUP BY room.id, room.name, room.capacity, room.location
      ORDER BY total_reservations DESC
    `;

    const result = await db.query(query, [startDate, endDate]);
    
    // Calculate utilization metrics
    const roomUtilization = result.rows.map(room => {
      const totalReservations = parseInt(room.total_reservations) || 0;
      const completedReservations = parseInt(room.completed_reservations) || 0;
      const noShows = parseInt(room.no_shows) || 0;
      const totalHoursUsed = parseFloat(room.total_hours_used) || 0;
      const avgDuration = parseFloat(room.avg_duration_hours) || 0;
      const avgAttendees = parseFloat(room.avg_attendees) || 0;
      const maxAttendeesUsed = parseInt(room.max_attendees_used) || 0;

      // Calculate business hours in the period
      const start = moment(startDate);
      const end = moment(endDate);
      const businessDays = end.diff(start, 'days') + 1;
      const businessHoursPerDay = 12; // 7 AM to 7 PM
      const totalBusinessHours = businessDays * businessHoursPerDay;

      return {
        ...room,
        total_reservations: totalReservations,
        completed_reservations: completedReservations,
        no_shows: noShows,
        avg_attendees: avgAttendees.toFixed(1),
        avg_duration_hours: avgDuration.toFixed(2),
        total_hours_used: totalHoursUsed.toFixed(2),
        max_attendees_used: maxAttendeesUsed,
        utilization_rate: totalBusinessHours > 0 ? 
          (totalHoursUsed / totalBusinessHours * 100).toFixed(2) : 0,
        completion_rate: totalReservations > 0 ? 
          (completedReservations / totalReservations * 100).toFixed(2) : 0,
        no_show_rate: totalReservations > 0 ? 
          (noShows / totalReservations * 100).toFixed(2) : 0,
        capacity_utilization: room.capacity > 0 ? 
          (avgAttendees / room.capacity * 100).toFixed(2) : 0
      };
    });

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      roomUtilization
    });

  } catch (error) {
    logger.error('Get room utilization error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el reporte de utilización de salas'
    });
  }
});

// Get user activity report
router.get('/users/activity', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate, department, role } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    let query = `
      SELECT 
        u.id,
        u.first_name || ' ' || u.last_name as user_name,
        u.email,
        u.role,
        u.department,
        COUNT(r.id) as total_reservations,
        COUNT(CASE WHEN r.status = 'pendiente' THEN 1 END) as pending_reservations,
        COUNT(CASE WHEN r.status = 'aprobada' THEN 1 END) as approved_reservations,
        COUNT(CASE WHEN r.status = 'rechazada' THEN 1 END) as rejected_reservations,
        COUNT(CASE WHEN r.status = 'cancelada' THEN 1 END) as cancelled_reservations,
        COUNT(CASE WHEN r.status = 'completada' THEN 1 END) as completed_reservations,
        COUNT(CASE WHEN r.no_show = true THEN 1 END) as no_shows,
        AVG(r.attendees_count) as avg_attendees,
        SUM(EXTRACT(EPOCH FROM (r.end_time - r.start_time))/3600) as total_hours_reserved,
        MAX(r.created_at) as last_reservation_date
      FROM users u
      LEFT JOIN reservations r ON u.id = r.user_id 
        AND DATE(r.start_time) BETWEEN $1 AND $2
      WHERE u.is_active = true
    `;

    const params = [startDate, endDate];
    let paramCount = 2;

    if (department) {
      paramCount++;
      query += ` AND u.department ILIKE $${paramCount}`;
      params.push(`%${department}%`);
    }

    if (role) {
      paramCount++;
      query += ` AND u.role = $${paramCount}`;
      params.push(role);
    }

    query += `
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.department
      ORDER BY total_reservations DESC
    `;

    const result = await db.query(query, params);
    
    const userActivity = result.rows.map(user => {
      const totalReservations = parseInt(user.total_reservations) || 0;
      const completedReservations = parseInt(user.completed_reservations) || 0;
      const noShows = parseInt(user.no_shows) || 0;
      const rejectedReservations = parseInt(user.rejected_reservations) || 0;

      return {
        ...user,
        total_reservations: totalReservations,
        pending_reservations: parseInt(user.pending_reservations) || 0,
        approved_reservations: parseInt(user.approved_reservations) || 0,
        rejected_reservations: rejectedReservations,
        cancelled_reservations: parseInt(user.cancelled_reservations) || 0,
        completed_reservations: completedReservations,
        no_shows: noShows,
        avg_attendees: parseFloat(user.avg_attendees)?.toFixed(1) || '0.0',
        total_hours_reserved: parseFloat(user.total_hours_reserved)?.toFixed(2) || '0.00',
        approval_rate: totalReservations > 0 ? 
          ((totalReservations - rejectedReservations) / totalReservations * 100).toFixed(2) : '0.00',
        completion_rate: totalReservations > 0 ? 
          (completedReservations / totalReservations * 100).toFixed(2) : '0.00',
        no_show_rate: totalReservations > 0 ? 
          (noShows / totalReservations * 100).toFixed(2) : '0.00'
      };
    });

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      filters: {
        department: department || 'all',
        role: role || 'all'
      },
      userActivity
    });

  } catch (error) {
    logger.error('Get user activity error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el reporte de actividad de usuarios'
    });
  }
});

// Get department statistics
router.get('/departments/stats', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const query = `
      SELECT 
        u.department,
        COUNT(DISTINCT u.id) as total_users,
        COUNT(r.id) as total_reservations,
        COUNT(CASE WHEN r.status = 'completada' THEN 1 END) as completed_reservations,
        COUNT(CASE WHEN r.no_show = true THEN 1 END) as no_shows,
        AVG(r.attendees_count) as avg_attendees,
        SUM(EXTRACT(EPOCH FROM (r.end_time - r.start_time))/3600) as total_hours_reserved
      FROM users u
      LEFT JOIN reservations r ON u.id = r.user_id 
        AND DATE(r.start_time) BETWEEN $1 AND $2
        AND r.status != 'cancelada'
      WHERE u.is_active = true AND u.department IS NOT NULL
      GROUP BY u.department
      ORDER BY total_reservations DESC
    `;

    const result = await db.query(query, [startDate, endDate]);
    
    const departmentStats = result.rows.map(dept => {
      const totalReservations = parseInt(dept.total_reservations) || 0;
      const completedReservations = parseInt(dept.completed_reservations) || 0;
      const noShows = parseInt(dept.no_shows) || 0;

      return {
        ...dept,
        total_users: parseInt(dept.total_users) || 0,
        total_reservations: totalReservations,
        completed_reservations: completedReservations,
        no_shows: noShows,
        avg_attendees: parseFloat(dept.avg_attendees)?.toFixed(1) || '0.0',
        total_hours_reserved: parseFloat(dept.total_hours_reserved)?.toFixed(2) || '0.00',
        reservations_per_user: dept.total_users > 0 ? 
          (totalReservations / dept.total_users).toFixed(2) : '0.00',
        completion_rate: totalReservations > 0 ? 
          (completedReservations / totalReservations * 100).toFixed(2) : '0.00',
        no_show_rate: totalReservations > 0 ? 
          (noShows / totalReservations * 100).toFixed(2) : '0.00'
      };
    });

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      departmentStats
    });

  } catch (error) {
    logger.error('Get department stats error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el reporte de estadísticas por departamento'
    });
  }
});

// Get coffee break report
router.get('/coffee-break/stats', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const query = `
      SELECT 
        coffee_break,
        COUNT(*) as reservation_count,
        AVG(attendees_count) as avg_attendees,
        SUM(attendees_count) as total_attendees_served,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as avg_duration_hours
      FROM reservations r
      WHERE DATE(r.start_time) BETWEEN $1 AND $2
        AND r.status IN ('aprobada', 'completada')
        AND EXTRACT(EPOCH FROM (end_time - start_time))/3600 >= 1
      GROUP BY coffee_break
      ORDER BY 
        CASE coffee_break 
          WHEN 'solicitado' THEN 1 
          WHEN 'no_solicitado' THEN 2 
          WHEN 'no_aplica' THEN 3 
        END
    `;

    const result = await db.query(query, [startDate, endDate]);
    
    const coffeeBreakStats = result.rows.map(stat => ({
      coffee_break_status: stat.coffee_break,
      reservation_count: parseInt(stat.reservation_count) || 0,
      avg_attendees: parseFloat(stat.avg_attendees)?.toFixed(1) || '0.0',
      total_attendees_served: parseInt(stat.total_attendees_served) || 0,
      avg_duration_hours: parseFloat(stat.avg_duration_hours)?.toFixed(2) || '0.00'
    }));

    // Calculate totals and percentages
    const totalReservations = coffeeBreakStats.reduce((sum, stat) => sum + stat.reservation_count, 0);
    const totalAttendeesServed = coffeeBreakStats.reduce((sum, stat) => sum + stat.total_attendees_served, 0);

    const summary = {
      total_eligible_reservations: totalReservations,
      total_attendees_served: totalAttendeesServed,
      coffee_break_requested: coffeeBreakStats.find(s => s.coffee_break_status === 'solicitado')?.reservation_count || 0,
      coffee_break_not_requested: coffeeBreakStats.find(s => s.coffee_break_status === 'no_solicitado')?.reservation_count || 0,
      request_rate: totalReservations > 0 ? 
        ((coffeeBreakStats.find(s => s.coffee_break_status === 'solicitado')?.reservation_count || 0) / totalReservations * 100).toFixed(2) : '0.00'
    };

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      summary,
      breakdown: coffeeBreakStats
    });

  } catch (error) {
    logger.error('Get coffee break stats error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el reporte de coffee break'
    });
  }
});

// Get daily usage pattern
router.get('/usage/daily-pattern', authenticateToken, requireApprover, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate, roomId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    let query = `
      SELECT 
        EXTRACT(HOUR FROM start_time) as hour_of_day,
        COUNT(*) as reservation_count,
        AVG(attendees_count) as avg_attendees,
        COUNT(DISTINCT room_id) as rooms_used
      FROM reservations r
      WHERE DATE(r.start_time) BETWEEN $1 AND $2
        AND r.status IN ('aprobada', 'completada')
    `;

    const params = [startDate, endDate];

    if (roomId) {
      query += ` AND r.room_id = $3`;
      params.push(roomId);
    }

    query += `
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY hour_of_day
    `;

    const result = await db.query(query, params);
    
    const dailyPattern = result.rows.map(row => ({
      hour: parseInt(row.hour_of_day),
      hour_display: `${row.hour_of_day}:00`,
      reservation_count: parseInt(row.reservation_count) || 0,
      avg_attendees: parseFloat(row.avg_attendees)?.toFixed(1) || '0.0',
      rooms_used: parseInt(row.rooms_used) || 0
    }));

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      roomId: roomId || 'all',
      dailyPattern
    });

  } catch (error) {
    logger.error('Get daily usage pattern error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el reporte de patrón de uso diario'
    });
  }
});

module.exports = router;
