const db = require('../database/connection');
const moment = require('moment');

class Reservation {
  static async create(reservationData) {
    const { 
      roomId, userId, title, description, startTime, endTime, 
      attendeesCount, coffeeBreak = 'no_aplica' 
    } = reservationData;
    
    const query = `
      INSERT INTO reservations (
        room_id, user_id, title, description, start_time, end_time, 
        attendees_count, coffee_break
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await db.query(query, [
      roomId, userId, title, description, startTime, endTime, 
      attendeesCount, coffeeBreak
    ]);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT 
        r.*,
        u.first_name || ' ' || u.last_name as organizer_name,
        u.email as organizer_email,
        u.department as organizer_department,
        room.name as room_name,
        room.capacity as room_capacity,
        room.location as room_location,
        approver.first_name || ' ' || approver.last_name as approver_name
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN rooms room ON r.room_id = room.id
      LEFT JOIN users approver ON r.approved_by = approver.id
      WHERE r.id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT 
        r.*,
        u.first_name || ' ' || u.last_name as organizer_name,
        u.email as organizer_email,
        room.name as room_name,
        room.location as room_location
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN rooms room ON r.room_id = room.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (filters.roomId) {
      paramCount++;
      query += ` AND r.room_id = $${paramCount}`;
      params.push(filters.roomId);
    }

    if (filters.userId) {
      paramCount++;
      query += ` AND r.user_id = $${paramCount}`;
      params.push(filters.userId);
    }

    if (filters.status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.startDate) {
      paramCount++;
      query += ` AND DATE(r.start_time) >= $${paramCount}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      query += ` AND DATE(r.start_time) <= $${paramCount}`;
      params.push(filters.endDate);
    }

    query += ` ORDER BY r.start_time DESC`;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, updateData) {
    const fields = [];
    const params = [id];
    let paramCount = 1;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        params.push(updateData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const query = `
      UPDATE reservations 
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async approve(id, approverId) {
    const query = `
      UPDATE reservations 
      SET status = 'aprobada', approved_by = $2, approved_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'pendiente'
      RETURNING *
    `;
    
    const result = await db.query(query, [id, approverId]);
    return result.rows[0];
  }

  static async reject(id, approverId, reason) {
    const query = `
      UPDATE reservations 
      SET status = 'rechazada', approved_by = $2, approved_at = CURRENT_TIMESTAMP, rejection_reason = $3
      WHERE id = $1 AND status = 'pendiente'
      RETURNING *
    `;
    
    const result = await db.query(query, [id, approverId, reason]);
    return result.rows[0];
  }

  static async cancel(id, reason = null) {
    const query = `
      UPDATE reservations 
      SET status = 'cancelada', rejection_reason = $2
      WHERE id = $1 AND status IN ('pendiente', 'aprobada')
      RETURNING *
    `;
    
    const result = await db.query(query, [id, reason]);
    return result.rows[0];
  }

  static async checkIn(id) {
    const query = `
      UPDATE reservations 
      SET checked_in = true, checked_in_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'aprobada'
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async markNoShow(id) {
    const query = `
      UPDATE reservations 
      SET no_show = true, status = 'completada'
      WHERE id = $1 AND status = 'aprobada'
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async confirmCompletion(id) {
    const query = `
      UPDATE reservations 
      SET completion_confirmed = true, completion_confirmed_at = CURRENT_TIMESTAMP, status = 'completada'
      WHERE id = $1 AND status = 'aprobada'
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async getCalendarView(startDate, endDate, roomId = null) {
    let query = `
      SELECT 
        r.id,
        r.title,
        r.start_time,
        r.end_time,
        r.status,
        r.attendees_count,
        r.coffee_break,
        u.first_name || ' ' || u.last_name as organizer_name,
        room.name as room_name,
        room.id as room_id
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN rooms room ON r.room_id = room.id
      WHERE r.status IN ('pendiente', 'aprobada', 'completada')
      AND DATE(r.start_time) BETWEEN $1 AND $2
    `;
    
    const params = [startDate, endDate];
    
    if (roomId) {
      query += ` AND r.room_id = $3`;
      params.push(roomId);
    }
    
    query += ` ORDER BY r.start_time`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async getPendingApprovals() {
    const query = `
      SELECT 
        r.*,
        u.first_name || ' ' || u.last_name as organizer_name,
        u.email as organizer_email,
        u.department as organizer_department,
        room.name as room_name,
        room.location as room_location
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN rooms room ON r.room_id = room.id
      WHERE r.status = 'pendiente'
      ORDER BY r.created_at ASC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async getUpcomingReservations(hours = 24) {
    const query = `
      SELECT 
        r.*,
        u.first_name || ' ' || u.last_name as organizer_name,
        u.email as organizer_email,
        room.name as room_name,
        room.location as room_location
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN rooms room ON r.room_id = room.id
      WHERE r.status = 'aprobada'
      AND r.start_time BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '${hours} hours'
      ORDER BY r.start_time ASC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async validateReservationTime(startTime, endTime, minAdvanceHours = 3) {
    const now = moment();
    const start = moment(startTime);
    const end = moment(endTime);
    
    const errors = [];
    
    // Check if start time is in the future with minimum advance
    if (start.diff(now, 'hours') < minAdvanceHours) {
      errors.push(`La reserva debe hacerse con al menos ${minAdvanceHours} horas de anticipación`);
    }
    
    // Check if end time is after start time
    if (end.isSameOrBefore(start)) {
      errors.push('La hora de fin debe ser posterior a la hora de inicio');
    }
    
    // Check if reservation is within business hours (7 AM - 7 PM)
    if (start.hour() < 7 || end.hour() > 19) {
      errors.push('Las reservas solo pueden realizarse entre las 7:00 AM y 7:00 PM');
    }
    
    // Check if reservation is not on weekends
    if (start.day() === 0 || start.day() === 6) {
      errors.push('No se pueden realizar reservas los fines de semana');
    }
    
    return errors;
  }
}

module.exports = Reservation;
