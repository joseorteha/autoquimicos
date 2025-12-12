const db = require('../database/connection');

class Room {
  static async create(roomData) {
    const { name, description, capacity, equipment, location } = roomData;
    
    const query = `
      INSERT INTO rooms (name, description, capacity, equipment, location)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await db.query(query, [name, description, capacity, equipment, location]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT * FROM rooms WHERE id = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll() {
    const query = `
      SELECT * FROM rooms WHERE is_active = true ORDER BY name
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async update(id, roomData) {
    const { name, description, capacity, equipment, location } = roomData;
    
    const query = `
      UPDATE rooms 
      SET name = $2, description = $3, capacity = $4, equipment = $5, location = $6
      WHERE id = $1 AND is_active = true
      RETURNING *
    `;
    
    const result = await db.query(query, [id, name, description, capacity, equipment, location]);
    return result.rows[0];
  }

  static async deactivate(id) {
    const query = `
      UPDATE rooms SET is_active = false WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async checkAvailability(roomId, startTime, endTime, excludeReservationId = null) {
    let query = `
      SELECT COUNT(*) as conflict_count
      FROM reservations 
      WHERE room_id = $1 
      AND status IN ('pendiente', 'aprobada')
      AND (
        ($2 >= start_time AND $2 < end_time) OR
        ($3 > start_time AND $3 <= end_time) OR
        ($2 <= start_time AND $3 >= end_time)
      )
    `;
    
    const params = [roomId, startTime, endTime];
    
    if (excludeReservationId) {
      query += ` AND id != $4`;
      params.push(excludeReservationId);
    }
    
    const result = await db.query(query, params);
    return parseInt(result.rows[0].conflict_count) === 0;
  }

  static async getAvailableRooms(startTime, endTime, minCapacity = null) {
    let query = `
      SELECT r.* FROM rooms r
      WHERE r.is_active = true
    `;
    
    const params = [startTime, endTime];
    let paramCount = 2;
    
    if (minCapacity) {
      paramCount++;
      query += ` AND r.capacity >= $${paramCount}`;
      params.push(minCapacity);
    }
    
    query += `
      AND NOT EXISTS (
        SELECT 1 FROM reservations res
        WHERE res.room_id = r.id
        AND res.status IN ('pendiente', 'aprobada')
        AND (
          ($1 >= res.start_time AND $1 < res.end_time) OR
          ($2 > res.start_time AND $2 <= res.end_time) OR
          ($1 <= res.start_time AND $2 >= res.end_time)
        )
      )
      ORDER BY r.name
    `;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async getRoomUsageStats(roomId, startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(CASE WHEN status = 'completada' THEN 1 END) as completed_reservations,
        COUNT(CASE WHEN no_show = true THEN 1 END) as no_shows,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as avg_duration_hours,
        SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as total_hours_used
      FROM reservations
      WHERE room_id = $1
      AND DATE(start_time) BETWEEN $2 AND $3
      AND status != 'cancelada'
    `;
    
    const result = await db.query(query, [roomId, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = Room;
