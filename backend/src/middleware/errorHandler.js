const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error Handler:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error.message = 'Ya existe un registro con estos datos';
        error.statusCode = 400;
        break;
      case '23503': // Foreign key violation
        error.message = 'Referencia inválida a otro registro';
        error.statusCode = 400;
        break;
      case '23514': // Check constraint violation
        error.message = 'Los datos no cumplen con las reglas de validación';
        error.statusCode = 400;
        break;
      case '42P01': // Undefined table
        error.message = 'Error de configuración de base de datos';
        error.statusCode = 500;
        break;
      default:
        error.message = 'Error de base de datos';
        error.statusCode = 500;
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error.message = message;
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Token inválido';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expirado';
    error.statusCode = 401;
  }

  // Cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    error.message = 'Identificador inválido';
    error.statusCode = 400;
  }

  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
