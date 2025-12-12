const { body, param, query, validationResult } = require('express-validator');
const moment = require('moment');

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Errores de validación',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Validaciones para usuarios
const validateUserCreation = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una mayúscula, una minúscula y un número'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres'),
  body('role')
    .isIn(['administrador', 'aprobador', 'organizador', 'recepcion'])
    .withMessage('Rol inválido'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('El departamento no puede exceder 100 caracteres'),
  body('phone')
    .optional()
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage('Formato de teléfono inválido'),
  handleValidationErrors
];

const validateUserUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El apellido debe tener entre 2 y 50 caracteres'),
  body('role')
    .optional()
    .isIn(['administrador', 'aprobador', 'organizador', 'recepcion'])
    .withMessage('Rol inválido'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('El departamento no puede exceder 100 caracteres'),
  body('phone')
    .optional()
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage('Formato de teléfono inválido'),
  handleValidationErrors
];

// Validaciones para salas
const validateRoomCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre de la sala debe tener entre 2 y 100 caracteres'),
  body('capacity')
    .isInt({ min: 1, max: 100 })
    .withMessage('La capacidad debe ser un número entre 1 y 100'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),
  body('equipment')
    .optional()
    .isArray()
    .withMessage('El equipamiento debe ser un array'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La ubicación no puede exceder 200 caracteres'),
  handleValidationErrors
];

// Validaciones para reservas
const validateReservationCreation = [
  body('roomId')
    .isUUID()
    .withMessage('ID de sala inválido'),
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres'),
  body('startTime')
    .isISO8601()
    .withMessage('Formato de fecha y hora de inicio inválido')
    .custom((value) => {
      const startTime = moment(value);
      const now = moment();
      
      if (startTime.isBefore(now)) {
        throw new Error('La fecha de inicio no puede ser en el pasado');
      }
      
      if (startTime.diff(now, 'hours') < 3) {
        throw new Error('La reserva debe hacerse con al menos 3 horas de anticipación');
      }
      
      return true;
    }),
  body('endTime')
    .isISO8601()
    .withMessage('Formato de fecha y hora de fin inválido')
    .custom((value, { req }) => {
      const startTime = moment(req.body.startTime);
      const endTime = moment(value);
      
      if (endTime.isSameOrBefore(startTime)) {
        throw new Error('La hora de fin debe ser posterior a la hora de inicio');
      }
      
      const duration = endTime.diff(startTime, 'hours');
      if (duration > 8) {
        throw new Error('La duración máxima de una reserva es de 8 horas');
      }
      
      return true;
    }),
  body('attendeesCount')
    .isInt({ min: 1, max: 50 })
    .withMessage('El número de asistentes debe ser entre 1 y 50'),
  body('coffeeBreak')
    .optional()
    .isIn(['no_aplica', 'solicitado', 'no_solicitado'])
    .withMessage('Estado de coffee break inválido'),
  handleValidationErrors
];

const validateReservationUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres'),
  body('startTime')
    .optional()
    .isISO8601()
    .withMessage('Formato de fecha y hora de inicio inválido'),
  body('endTime')
    .optional()
    .isISO8601()
    .withMessage('Formato de fecha y hora de fin inválido'),
  body('attendeesCount')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('El número de asistentes debe ser entre 1 y 50'),
  body('coffeeBreak')
    .optional()
    .isIn(['no_aplica', 'solicitado', 'no_solicitado'])
    .withMessage('Estado de coffee break inválido'),
  handleValidationErrors
];

// Validaciones para autenticación
const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida'),
  handleValidationErrors
];

// Validaciones para parámetros de URL
const validateUUID = [
  param('id')
    .isUUID()
    .withMessage('ID inválido'),
  handleValidationErrors
];

// Validaciones para consultas de fecha
const validateDateRange = [
  query('startDate')
    .optional()
    .isDate()
    .withMessage('Formato de fecha de inicio inválido'),
  query('endDate')
    .optional()
    .isDate()
    .withMessage('Formato de fecha de fin inválido')
    .custom((value, { req }) => {
      if (req.query.startDate && value) {
        const startDate = moment(req.query.startDate);
        const endDate = moment(value);
        
        if (endDate.isBefore(startDate)) {
          throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
        }
      }
      return true;
    }),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserCreation,
  validateUserUpdate,
  validateRoomCreation,
  validateReservationCreation,
  validateReservationUpdate,
  validateLogin,
  validateUUID,
  validateDateRange
};
