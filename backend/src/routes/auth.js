const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateLogin } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }

    // Validate password
    const isValidPassword = await User.validatePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Remove password from response
    const { password_hash, ...userResponse } = user;

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      token,
      user: userResponse
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo procesar la solicitud de inicio de sesión'
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({
        error: 'Token requerido',
        message: 'No se proporcionó token para renovar'
      });
    }

    // Verify current token (even if expired)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Allow expired tokens for refresh
        decoded = jwt.decode(token);
      } else {
        throw error;
      }
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: 'Usuario no encontrado',
        message: 'El usuario asociado al token no existe'
      });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: 'Token renovado exitosamente',
      token: newToken
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token inválido',
      message: 'No se pudo renovar el token'
    });
  }
});

// Logout (client-side token removal, but we can log it)
router.post('/logout', (req, res) => {
  // In a more complex setup, you might want to blacklist the token
  logger.info('User logged out');
  
  res.json({
    success: true,
    message: 'Sesión cerrada exitosamente'
  });
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Token requerido',
        message: 'No se proporcionó token de autenticación'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        error: 'Usuario no encontrado',
        message: 'El usuario asociado al token no existe'
      });
    }

    res.json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        department: user.department
      }
    });

  } catch (error) {
    logger.error('Token verification error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido',
        valid: false
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        valid: false
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      valid: false
    });
  }
});

module.exports = router;
