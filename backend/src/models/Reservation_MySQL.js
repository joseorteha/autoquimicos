const db = require('../database/connection');
const moment = require('moment');

class Reservation {
  static async create(reservationData) {
    const {
      idUsuario, idSala, titulo, asistentes, fecha, horaInicio, horaFin,
      requireCoffee = 0
    } = reservationData;

    // Get 'Pendiente' status ID
    const statusQuery = `SELECT id_estado FROM estados_reserva WHERE nombre = 'Pendiente'`;
    const statusResult = await db.query(statusQuery);
    const statusId = statusResult.rows[0].id_estado;

    const query = `
      INSERT INTO reservas (
        id_usuario, id_sala, titulo, asistentes, fecha, hora_inicio, hora_fin, 
        id_estado, requiere_coffee
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.query(query, [
      idUsuario, idSala, titulo, asistentes, fecha, horaInicio, horaFin,
      statusId, requireCoffee
    ]);

    // Get the created reservation with details
    return await this.findById(result.rows.insertId);
  }

  static async findById(id) {
    const query = `
      SELECT 
        r.*,
        u.nombre as organizer_name,
        u.correo as organizer_email,
        s.nombre as room_name,
        s.capacidad as room_capacity,
        e.nombre as status_name
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN salas s ON r.id_sala = s.id_sala
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      WHERE r.id_reserva = ?
    `;

    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT 
        r.*,
        u.nombre as organizer_name,
        u.correo as organizer_email,
        s.nombre as room_name,
        e.nombre as status_name
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN salas s ON r.id_sala = s.id_sala
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (filters.roomId) {
      paramCount++;
      query += ` AND r.id_sala = ?`;
      params.push(filters.roomId);
    }

    if (filters.userId) {
      paramCount++;
      query += ` AND r.id_usuario = ?`;
      params.push(filters.userId);
    }

    if (filters.status) {
      paramCount++;
      query += ` AND e.nombre = ?`;
      params.push(filters.status);
    }

    if (filters.startDate) {
      paramCount++;
      query += ` AND r.fecha >= ?`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      query += ` AND r.fecha <= ?`;
      params.push(filters.endDate);
    }

    query += ` ORDER BY r.fecha DESC, r.hora_inicio DESC`;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, updateData) {
    const fields = [];
    const params = [];
    let paramCount = 0;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        paramCount++;
        // Map field names to database columns
        const fieldMap = {
          titulo: 'titulo',
          asistentes: 'asistentes',
          fecha: 'fecha',
          horaInicio: 'hora_inicio',
          horaFin: 'hora_fin',
          requireCoffee: 'requiere_coffee',
          motivoCancelacion: 'motivo_cancelacion'
        };

        const dbField = fieldMap[key] || key;
        fields.push(`${dbField} = ?`);
        params.push(updateData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(id);

    const query = `
      UPDATE reservas 
      SET ${fields.join(', ')}
      WHERE id_reserva = ?
    `;

    await db.query(query, params);
    return await this.findById(id);
  }

  static async approve(id, approverId) {
    // Get 'Aprobada' status ID
    const statusQuery = `SELECT id_estado FROM estados_reserva WHERE nombre = 'Aprobada'`;
    const statusResult = await db.query(statusQuery);
    const statusId = statusResult.rows[0].id_estado;

    const query = `
      UPDATE reservas 
      SET id_estado = ?
      WHERE id_reserva = ? AND id_estado = (SELECT id_estado FROM estados_reserva WHERE nombre = 'Pendiente')
    `;

    const result = await db.query(query, [statusId, id]);

    if (result.rows.affectedRows === 0) {
      return null;
    }

    return await this.findById(id);
  }

  static async reject(id, approverId, reason) {
    // Get 'Rechazada' status ID
    const statusQuery = `SELECT id_estado FROM estados_reserva WHERE nombre = 'Rechazada'`;
    const statusResult = await db.query(statusQuery);
    const statusId = statusResult.rows[0].id_estado;

    const query = `
      UPDATE reservas 
      SET id_estado = ?, motivo_cancelacion = ?
      WHERE id_reserva = ? AND id_estado = (SELECT id_estado FROM estados_reserva WHERE nombre = 'Pendiente')
    `;

    const result = await db.query(query, [statusId, reason, id]);

    if (result.rows.affectedRows === 0) {
      return null;
    }

    return await this.findById(id);
  }

  static async cancel(id, reason = null) {
    // Get 'Cancelada' status ID
    const statusQuery = `SELECT id_estado FROM estados_reserva WHERE nombre = 'Cancelada'`;
    const statusResult = await db.query(statusQuery);
    const statusId = statusResult.rows[0].id_estado;

    const query = `
      UPDATE reservas 
      SET id_estado = ?, motivo_cancelacion = ?
      WHERE id_reserva = ? AND id_estado IN (
        SELECT id_estado FROM estados_reserva WHERE nombre IN ('Pendiente', 'Aprobada')
      )
    `;

    const result = await db.query(query, [statusId, reason, id]);

    if (result.rows.affectedRows === 0) {
      return null;
    }

    return await this.findById(id);
  }

  static async checkIn(id) {
    const query = `
      INSERT INTO checkin_registro (id_reserva, fecha_hora_checkin, valido)
      VALUES (?, NOW(), 1)
    `;

    await db.query(query, [id]);
    return await this.findById(id);
  }

  static async markNoShow(id) {
    // Get 'No-show' status ID
    const statusQuery = `SELECT id_estado FROM estados_reserva WHERE nombre = 'No-show'`;
    const statusResult = await db.query(statusQuery);
    const statusId = statusResult.rows[0].id_estado;

    // Mark as no-show in checkin_registro
    const noShowQuery = `
      INSERT INTO checkin_registro (id_reserva, fecha_hora_checkin, valido)
      VALUES (?, NOW(), 0)
      ON DUPLICATE KEY UPDATE valido = 0
    `;

    await db.query(noShowQuery, [id]);

    // Update reservation status
    const updateQuery = `
      UPDATE reservas SET id_estado = ?
      WHERE id_reserva = ? AND id_estado = (SELECT id_estado FROM estados_reserva WHERE nombre = 'Aprobada')
    `;

    await db.query(updateQuery, [statusId, id]);
    return await this.findById(id);
  }

  static async confirmCompletion(id) {
    // Get 'Finalizada' status ID
    const statusQuery = `SELECT id_estado FROM estados_reserva WHERE nombre = 'Finalizada'`;
    const statusResult = await db.query(statusQuery);
    const statusId = statusResult.rows[0].id_estado;

    const query = `
      UPDATE reservas 
      SET id_estado = ?
      WHERE id_reserva = ? AND id_estado = (SELECT id_estado FROM estados_reserva WHERE nombre = 'Aprobada')
    `;

    const result = await db.query(query, [statusId, id]);

    if (result.rows.affectedRows === 0) {
      return null;
    }

    return await this.findById(id);
  }

  static async getCalendarView(startDate, endDate, roomId = null) {
    let query = `
      SELECT 
        r.id_reserva,
        r.titulo,
        r.fecha,
        r.hora_inicio,
        r.hora_fin,
        r.asistentes,
        r.requiere_coffee,
        e.nombre as status,
        u.nombre as organizer_name,
        s.nombre as room_name,
        s.id_sala as room_id
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN salas s ON r.id_sala = s.id_sala
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      WHERE e.nombre IN ('Pendiente', 'Aprobada', 'Finalizada')
      AND r.fecha BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (roomId) {
      query += ` AND r.id_sala = ?`;
      params.push(roomId);
    }

    query += ` ORDER BY r.fecha, r.hora_inicio`;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async getPendingApprovals() {
    const query = `
      SELECT 
        r.*,
        u.nombre as organizer_name,
        u.correo as organizer_email,
        s.nombre as room_name
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN salas s ON r.id_sala = s.id_sala
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      WHERE e.nombre = 'Pendiente'
      ORDER BY r.fecha_creacion ASC
    `;

    const result = await db.query(query);
    return result.rows;
  }

  static async getUpcomingReservations(hours = 24) {
    const query = `
      SELECT 
        r.*,
        u.nombre as organizer_name,
        u.correo as organizer_email,
        s.nombre as room_name
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN salas s ON r.id_sala = s.id_sala
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      WHERE e.nombre = 'Aprobada'
      AND CONCAT(r.fecha, ' ', r.hora_inicio) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)
      ORDER BY r.fecha, r.hora_inicio ASC
    `;

    const result = await db.query(query, [hours]);
    return result.rows;
  }

  static async validateReservationTime(fecha, horaInicio, horaFin, minAdvanceHours = 3) {
    const now = moment();
    const reservationDateTime = moment(`${fecha} ${horaInicio}`);
    const endDateTime = moment(`${fecha} ${horaFin}`);

    const errors = [];

    // Check if start time is in the future with minimum advance
    if (reservationDateTime.diff(now, 'hours') < minAdvanceHours) {
      errors.push(`La reserva debe hacerse con al menos ${minAdvanceHours} horas de anticipación`);
    }

    // Check if end time is after start time
    if (endDateTime.isSameOrBefore(reservationDateTime)) {
      errors.push('La hora de fin debe ser posterior a la hora de inicio');
    }

    // Check if reservation is within business hours (7 AM - 7 PM)
    const startHour = moment(horaInicio, 'HH:mm').hour();
    const endHour = moment(horaFin, 'HH:mm').hour();

    if (startHour < 7 || endHour > 19) {
      errors.push('Las reservas solo pueden realizarse entre las 7:00 AM y 7:00 PM');
    }

    // Check if reservation is not on weekends
    const dayOfWeek = moment(fecha).day();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      errors.push('No se pueden realizar reservas los fines de semana');
    }

    return errors;
  }
}

module.exports = Reservation;
