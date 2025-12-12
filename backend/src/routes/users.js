const express = require('express');
const User = require('../models/User');
const { authenticateToken, requireAdmin, requireApprover } = require('../middleware/auth');
const { validateUserCreation, validateUserUpdate, validateUUID } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El perfil del usuario no existe'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el perfil del usuario'
    });
  }
});

// Update current user profile
router.put('/profile', authenticateToken, validateUserUpdate, async (req, res) => {
  try {
    const { firstName, lastName, department, phone } = req.body;
    
    const updatedUser = await User.update(req.user.id, {
      firstName,
      lastName,
      department,
      phone
    });

    if (!updatedUser) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'No se pudo actualizar el perfil'
      });
    }

    logger.info(`User profile updated: ${updatedUser.email}`);

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });

  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo actualizar el perfil'
    });
  }
});

// Get all users (Admin and Approver only)
router.get('/', authenticateToken, requireApprover, async (req, res) => {
  try {
    const { role, department } = req.query;
    
    const filters = {};
    if (role) filters.role = role;
    if (department) filters.department = department;

    const users = await User.findAll(filters);

    res.json({
      success: true,
      count: users.length,
      users
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la lista de usuarios'
    });
  }
});

// Get user by ID (Admin and Approver only)
router.get('/:id', authenticateToken, requireApprover, validateUUID, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario especificado no existe'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    logger.error('Get user by ID error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el usuario'
    });
  }
});

// Create new user (Admin only)
router.post('/', authenticateToken, requireAdmin, validateUserCreation, async (req, res) => {
  try {
    const userData = req.body;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(userData.email);
    if (existingUser) {
      return res.status(400).json({
        error: 'Usuario ya existe',
        message: 'Ya existe un usuario con este email'
      });
    }

    const newUser = await User.create(userData);

    logger.info(`New user created: ${newUser.email} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      user: newUser
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear el usuario'
    });
  }
});

// Update user (Admin only)
router.put('/:id', authenticateToken, requireAdmin, validateUUID, validateUserUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const userData = req.body;

    const updatedUser = await User.update(id, userData);

    if (!updatedUser) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'No se pudo actualizar el usuario'
      });
    }

    logger.info(`User updated: ${updatedUser.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      user: updatedUser
    });

  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo actualizar el usuario'
    });
  }
});

// Deactivate user (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deactivating themselves
    if (id === req.user.id) {
      return res.status(400).json({
        error: 'Operación no permitida',
        message: 'No puede desactivar su propia cuenta'
      });
    }

    const deactivatedUser = await User.deactivate(id);

    if (!deactivatedUser) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'No se pudo desactivar el usuario'
      });
    }

    logger.info(`User deactivated: ${deactivatedUser.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Usuario desactivado exitosamente',
      user: deactivatedUser
    });

  } catch (error) {
    logger.error('Deactivate user error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo desactivar el usuario'
    });
  }
});

// Get users by role
router.get('/role/:role', authenticateToken, requireApprover, async (req, res) => {
  try {
    const { role } = req.params;
    
    const validRoles = ['administrador', 'aprobador', 'organizador', 'recepcion'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Rol inválido',
        message: 'El rol especificado no es válido'
      });
    }

    const users = await User.getUsersByRole(role);

    res.json({
      success: true,
      count: users.length,
      users
    });

  } catch (error) {
    logger.error('Get users by role error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener los usuarios por rol'
    });
  }
});

module.exports = router;
