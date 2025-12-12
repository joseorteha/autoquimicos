const db = require('../database/connection');

class Room {
  static async create(roomData) {
    const { nombre, descripcion, capacidad } = roomData;
    
    const query = `
      INSERT INTO salas (nombre, descripcion, capacidad)
      VALUES (?, ?, ?)
    `;
    
    const result = await db.query(query, [nombre, descripcion, capacidad]);
    
    // Get the created room
    const getRoomQuery = `SELECT * FROM salas WHERE id_sala = ?`;
    const roomResult = await db.query(getRoomQuery, [result.rows.insertId]);
    return roomResult.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT * FROM salas WHERE id_sala = ? AND activa = 1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll() {
    const query = `
      SELECT * FROM salas WHERE activa = 1 ORDER BY nombre
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async update(id, roomData) {
    const { nombre, descripcion, capacidad } = roomData;
    
    const query = `
      UPDATE salas 
      SET nombre = ?, descripcion = ?, capacidad = ?
      WHERE id_sala = ? AND activa = 1
    `;
    
    await db.query(query, [nombre, descripcion, capacidad, id]);
    return await this.findById(id);
  }

  static async deactivate(id) {
    const query = `
      UPDATE salas SET activa = 0 WHERE id_sala = ?
    `;
    
    await db.query(query, [id]);
    
    const getRoomQuery = `SELECT * FROM salas WHERE id_sala = ?`;
    const result = await db.query(getRoomQuery, [id]);
    return result.rows[0];
  }

  static async checkAvailability(roomId, fecha, horaInicio, horaFin, excludeReservationId = null) {
    let query = `
      SELECT COUNT(*) as conflict_count
      FROM reservas r
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      WHERE r.id_sala = ? 
      AND r.fecha = ?
      AND e.nombre IN ('pendiente', 'aprobada')
      AND (
        (? >= r.hora_inicio AND ? < r.hora_fin) OR
        (? > r.hora_inicio AND ? <= r.hora_fin) OR
        (? <= r.hora_inicio AND ? >= r.hora_fin)
      )
    `;
    
    const params = [roomId, fecha, horaInicio, horaInicio, horaFin, horaFin, horaInicio, horaFin];
    
    if (excludeReservationId) {
      query += ` AND r.id_reserva != ?`;
      params.push(excludeReservationId);
    }
    
    const result = await db.query(query, params);
    return parseInt(result.rows[0].conflict_count) === 0;
  }

  static async getAvailableRooms(fecha, horaInicio, horaFin, minCapacity = null) {
    let query = `
      SELECT s.* FROM salas s
      WHERE s.activa = 1
    `;
    
    const params = [fecha, horaInicio, horaInicio, horaFin, horaFin, horaInicio, horaFin];
    let paramCount = 7;
    
    if (minCapacity) {
      paramCount++;
      query += ` AND s.capacidad >= ?`;
      params.push(minCapacity);
    }
    
    query += `
      AND NOT EXISTS (
        SELECT 1 FROM reservas r
        JOIN estados_reserva e ON r.id_estado = e.id_estado
        WHERE r.id_sala = s.id_sala
        AND r.fecha = ?
        AND e.nombre IN ('pendiente', 'aprobada')
        AND (
          (? >= r.hora_inicio AND ? < r.hora_fin) OR
          (? > r.hora_inicio AND ? <= r.hora_fin) OR
          (? <= r.hora_inicio AND ? >= r.hora_fin)
        )
      )
      ORDER BY s.nombre
    `;
    
    // Reorganize params for the subquery
    const finalParams = [];
    if (minCapacity) {
      finalParams.push(minCapacity);
    }
    finalParams.push(fecha, horaInicio, horaInicio, horaFin, horaFin, horaInicio, horaFin);
    
    const result = await db.query(query, finalParams);
    return result.rows;
  }

  static async getRoomUsageStats(roomId, startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(CASE WHEN e.nombre = 'completada' THEN 1 END) as completed_reservations,
        COUNT(CASE WHEN cr.valido = 0 THEN 1 END) as no_shows,
        AVG(TIMESTAMPDIFF(HOUR, 
          CONCAT(r.fecha, ' ', r.hora_inicio), 
          CONCAT(r.fecha, ' ', r.hora_fin)
        )) as avg_duration_hours,
        SUM(TIMESTAMPDIFF(HOUR, 
          CONCAT(r.fecha, ' ', r.hora_inicio), 
          CONCAT(r.fecha, ' ', r.hora_fin)
        )) as total_hours_used
      FROM reservas r
      JOIN estados_reserva e ON r.id_estado = e.id_estado
      LEFT JOIN checkin_registro cr ON r.id_reserva = cr.id_reserva
      WHERE r.id_sala = ?
      AND r.fecha BETWEEN ? AND ?
      AND e.nombre != 'cancelada'
    `;
    
    const result = await db.query(query, [roomId, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = Room;
