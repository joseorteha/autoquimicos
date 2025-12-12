const db = require('../database/connection');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { email, password, nombre, role, telefono } = userData;
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Get role ID
    const roleQuery = `SELECT id_rol FROM roles WHERE nombre = ?`;
    const roleResult = await db.query(roleQuery, [role]);
    
    if (roleResult.rows.length === 0) {
      throw new Error(`Role ${role} not found`);
    }
    
    const roleId = roleResult.rows[0].id_rol;
    
    const query = `
      INSERT INTO usuarios (nombre, correo, telefono, id_rol, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const result = await db.query(query, [nombre, email, telefono, roleId, passwordHash]);
    
    // Get the created user
    const getUserQuery = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, r.nombre as role, u.activo, u.created_at
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = ?
    `;
    
    const userResult = await db.query(getUserQuery, [result.rows.insertId]);
    return userResult.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, r.nombre as role, u.activo, u.created_at, u.updated_at
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = ? AND u.activo = 1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, u.password_hash, r.nombre as role, u.activo, u.created_at
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.correo = ? AND u.activo = 1
    `;
    
    const result = await db.query(query, [email]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, r.nombre as role, u.activo, u.created_at, u.updated_at
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.activo = 1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.role) {
      paramCount++;
      query += ` AND r.nombre = ?`;
      params.push(filters.role);
    }

    query += ` ORDER BY u.nombre`;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, userData) {
    const { nombre, telefono } = userData;
    
    const query = `
      UPDATE usuarios 
      SET nombre = ?, telefono = ?
      WHERE id_usuario = ? AND activo = 1
    `;
    
    await db.query(query, [nombre, telefono, id]);
    
    // Return updated user
    return await this.findById(id);
  }

  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    const query = `
      UPDATE usuarios SET password_hash = ? WHERE id_usuario = ? AND activo = 1
    `;
    
    await db.query(query, [passwordHash, id]);
    return await this.findById(id);
  }

  static async deactivate(id) {
    const query = `
      UPDATE usuarios SET activo = 0 WHERE id_usuario = ?
    `;
    
    await db.query(query, [id]);
    
    const getUserQuery = `
      SELECT u.id_usuario, u.nombre, u.correo, u.activo
      FROM usuarios u
      WHERE u.id_usuario = ?
    `;
    
    const result = await db.query(getUserQuery, [id]);
    return result.rows[0];
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async getUsersByRole(role) {
    const query = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, r.nombre as role
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre = ? AND u.activo = 1
      ORDER BY u.nombre
    `;
    
    const result = await db.query(query, [role]);
    return result.rows;
  }
}

module.exports = User;
