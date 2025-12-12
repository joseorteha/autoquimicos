const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido',
        message: 'No se proporcionó token de autenticación' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ 
        error: 'Token inválido',
        message: 'El usuario asociado al token no existe' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token inválido',
        message: 'El token proporcionado no es válido' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expirado',
        message: 'El token ha expirado, por favor inicie sesión nuevamente' 
      });
    }

    return res.status(500).json({ 
      error: 'Error de autenticación',
      message: 'Error interno del servidor' 
    });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'No autenticado',
        message: 'Debe estar autenticado para acceder a este recurso' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Acceso denegado',
        message: `Rol requerido: ${roles.join(' o ')}. Su rol actual: ${req.user.role}` 
      });
    }

    next();
  };
};

// Middleware específicos para cada rol
const requireAdmin = authorizeRoles('administrador');
const requireApprover = authorizeRoles('administrador', 'aprobador');
const requireOrganizer = authorizeRoles('administrador', 'aprobador', 'organizador');
const requireReception = authorizeRoles('administrador', 'recepcion');

// Middleware para verificar si el usuario puede modificar una reserva
const canModifyReservation = async (req, res, next) => {
  try {
    const { user } = req;
    const reservationId = req.params.id;

    // Los administradores pueden modificar cualquier reserva
    if (user.role === 'administrador') {
      return next();
    }

    // Los aprobadores pueden modificar reservas pendientes
    if (user.role === 'aprobador') {
      return next();
    }

    // Los organizadores solo pueden modificar sus propias reservas
    if (user.role === 'organizador') {
      const Reservation = require('../models/Reservation');
      const reservation = await Reservation.findById(reservationId);
      
      if (!reservation) {
        return res.status(404).json({ 
          error: 'Reserva no encontrada',
          message: 'La reserva especificada no existe' 
        });
      }

      if (reservation.user_id !== user.id) {
        return res.status(403).json({ 
          error: 'Acceso denegado',
          message: 'Solo puede modificar sus propias reservas' 
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Authorization error:', error);
    return res.status(500).json({ 
      error: 'Error de autorización',
      message: 'Error interno del servidor' 
    });
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireAdmin,
  requireApprover,
  requireOrganizer,
  requireReception,
  canModifyReservation
};
