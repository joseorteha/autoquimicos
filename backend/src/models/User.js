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
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, r.nombre as role, u.activo
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = ?
    `;

    const userResult = await db.query(getUserQuery, [result.rows.insertId]);
    return userResult.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, r.nombre as role, u.activo
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = ? AND u.activo = 1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT u.id_usuario, u.nombre, u.correo, u.telefono, u.password_hash, r.nombre as role, u.activo
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.correo = ? AND u.activo = 1
    `;

    const result = await db.query(query, [email]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT id, email, first_name, last_name, role, department, phone, is_active, created_at, updated_at
      FROM users WHERE is_active = true
    `;
    const params = [];
    let paramCount = 0;

    if (filters.role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(filters.role);
    }

    if (filters.department) {
      paramCount++;
      query += ` AND department ILIKE $${paramCount}`;
      params.push(`%${filters.department}%`);
    }

    query += ` ORDER BY first_name, last_name`;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, userData) {
    const { firstName, lastName, role, department, phone } = userData;

    const query = `
      UPDATE users 
      SET first_name = $2, last_name = $3, role = $4, department = $5, phone = $6
      WHERE id = $1 AND is_active = true
      RETURNING id, email, first_name, last_name, role, department, phone, is_active, updated_at
    `;

    const result = await db.query(query, [id, firstName, lastName, role, department, phone]);
    return result.rows[0];
  }

  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const query = `
      UPDATE users SET password_hash = $2 WHERE id = $1 AND is_active = true
      RETURNING id, email, first_name, last_name
    `;

    const result = await db.query(query, [id, passwordHash]);
    return result.rows[0];
  }

  static async deactivate(id) {
    const query = `
      UPDATE users SET is_active = false WHERE id = $1
      RETURNING id, email, first_name, last_name, is_active
    `;

    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async getUsersByRole(role) {
    const query = `
      SELECT id, email, first_name, last_name, role, department, phone
      FROM users WHERE role = $1 AND is_active = true
      ORDER BY first_name, last_name
    `;

    const result = await db.query(query, [role]);
    return result.rows;
  }
}

module.exports = User;
