const express = require('express');
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const { authenticateToken, requireApprover, canModifyReservation } = require('../middleware/auth');
const { validateReservationCreation, validateReservationUpdate, validateUUID, validateDateRange } = require('../middleware/validation');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Get all reservations with filters
router.get('/', authenticateToken, validateDateRange, async (req, res) => {
  try {
    const { roomId, userId, status, startDate, endDate, limit } = req.query;
    
    const filters = {};
    if (roomId) filters.roomId = roomId;
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (limit) filters.limit = parseInt(limit);

    // Regular users can only see their own reservations unless they're admin/approver
    if (req.user.role === 'organizador') {
      filters.userId = req.user.id;
    } else if (userId) {
      filters.userId = userId;
    }

    const reservations = await Reservation.findAll(filters);

    res.json({
      success: true,
      count: reservations.length,
      reservations
    });

  } catch (error) {
    logger.error('Get reservations error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener las reservas'
    });
  }
});

// Get reservation by ID
router.get('/:id', authenticateToken, validateUUID, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva especificada no existe'
      });
    }

    // Check if user can view this reservation
    if (req.user.role === 'organizador' && reservation.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'Solo puede ver sus propias reservas'
      });
    }

    res.json({
      success: true,
      reservation
    });

  } catch (error) {
    logger.error('Get reservation by ID error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la reserva'
    });
  }
});

// Create new reservation
router.post('/', authenticateToken, validateReservationCreation, async (req, res) => {
  try {
    const { roomId, title, description, startTime, endTime, attendeesCount, coffeeBreak } = req.body;

    // Validate reservation time
    const timeValidationErrors = await Reservation.validateReservationTime(startTime, endTime);
    if (timeValidationErrors.length > 0) {
      return res.status(400).json({
        error: 'Horario inválido',
        message: timeValidationErrors.join(', ')
      });
    }

    // Check room exists and capacity
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        error: 'Sala no encontrada',
        message: 'La sala especificada no existe'
      });
    }

    if (attendeesCount > room.capacity) {
      return res.status(400).json({
        error: 'Capacidad excedida',
        message: `La sala ${room.name} tiene capacidad para ${room.capacity} personas, pero se solicitaron ${attendeesCount} asistentes`
      });
    }

    // Check room availability
    const isAvailable = await Room.checkAvailability(roomId, startTime, endTime);
    if (!isAvailable) {
      return res.status(409).json({
        error: 'Conflicto de horario',
        message: 'La sala no está disponible en el horario solicitado'
      });
    }

    // Determine coffee break status based on business rules
    let finalCoffeeBreak = coffeeBreak || 'no_aplica';
    const duration = moment(endTime).diff(moment(startTime), 'hours');
    const startHour = moment(startTime).hour();
    const endHour = moment(endTime).hour();

    if (duration < 1) {
      finalCoffeeBreak = 'no_aplica';
    } else if (startHour >= 9 && endHour <= 13) {
      // Coffee break available between 9:30 AM and 1:00 PM
      if (!coffeeBreak) {
        finalCoffeeBreak = 'no_solicitado';
      }
    } else {
      finalCoffeeBreak = 'no_aplica';
    }

    const reservationData = {
      roomId,
      userId: req.user.id,
      title,
      description,
      startTime,
      endTime,
      attendeesCount,
      coffeeBreak: finalCoffeeBreak
    };

    const newReservation = await Reservation.create(reservationData);

    logger.info(`New reservation created: ${newReservation.id} by ${req.user.email}`);

    // TODO: Send notification to approvers

    res.status(201).json({
      success: true,
      message: 'Reserva creada exitosamente. Pendiente de aprobación.',
      reservation: newReservation
    });

  } catch (error) {
    logger.error('Create reservation error:', error);
    
    if (error.message.includes('Conflicto de horario')) {
      return res.status(409).json({
        error: 'Conflicto de horario',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear la reserva'
    });
  }
});

// Update reservation
router.put('/:id', authenticateToken, validateUUID, canModifyReservation, validateReservationUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const currentReservation = await Reservation.findById(id);
    if (!currentReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva especificada no existe'
      });
    }

    // Check if reservation can be modified
    if (currentReservation.status === 'completada' || currentReservation.status === 'cancelada') {
      return res.status(400).json({
        error: 'Reserva no modificable',
        message: 'No se puede modificar una reserva completada o cancelada'
      });
    }

    // If updating time, validate new time and availability
    if (updateData.startTime || updateData.endTime) {
      const newStartTime = updateData.startTime || currentReservation.start_time;
      const newEndTime = updateData.endTime || currentReservation.end_time;

      const timeValidationErrors = await Reservation.validateReservationTime(newStartTime, newEndTime);
      if (timeValidationErrors.length > 0) {
        return res.status(400).json({
          error: 'Horario inválido',
          message: timeValidationErrors.join(', ')
        });
      }

      const isAvailable = await Room.checkAvailability(
        currentReservation.room_id, 
        newStartTime, 
        newEndTime, 
        id
      );
      
      if (!isAvailable) {
        return res.status(409).json({
          error: 'Conflicto de horario',
          message: 'La sala no está disponible en el nuevo horario solicitado'
        });
      }

      // Reset approval if time is changed
      if (currentReservation.status === 'aprobada') {
        updateData.status = 'pendiente';
        updateData.approved_by = null;
        updateData.approved_at = null;
      }
    }

    const updatedReservation = await Reservation.update(id, updateData);

    logger.info(`Reservation updated: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Reserva actualizada exitosamente',
      reservation: updatedReservation
    });

  } catch (error) {
    logger.error('Update reservation error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo actualizar la reserva'
    });
  }
});

// Approve reservation (Approver only)
router.post('/:id/approve', authenticateToken, requireApprover, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const approvedReservation = await Reservation.approve(id, req.user.id);

    if (!approvedReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva no existe o no está pendiente de aprobación'
      });
    }

    logger.info(`Reservation approved: ${id} by ${req.user.email}`);

    // TODO: Send notification to organizer

    res.json({
      success: true,
      message: 'Reserva aprobada exitosamente',
      reservation: approvedReservation
    });

  } catch (error) {
    logger.error('Approve reservation error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo aprobar la reserva'
    });
  }
});

// Reject reservation (Approver only)
router.post('/:id/reject', authenticateToken, requireApprover, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        error: 'Razón requerida',
        message: 'Debe proporcionar una razón para rechazar la reserva'
      });
    }

    const rejectedReservation = await Reservation.reject(id, req.user.id, reason);

    if (!rejectedReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva no existe o no está pendiente de aprobación'
      });
    }

    logger.info(`Reservation rejected: ${id} by ${req.user.email}, reason: ${reason}`);

    // TODO: Send notification to organizer

    res.json({
      success: true,
      message: 'Reserva rechazada exitosamente',
      reservation: rejectedReservation
    });

  } catch (error) {
    logger.error('Reject reservation error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo rechazar la reserva'
    });
  }
});

// Cancel reservation
router.post('/:id/cancel', authenticateToken, validateUUID, canModifyReservation, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const cancelledReservation = await Reservation.cancel(id, reason);

    if (!cancelledReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva no existe o no puede ser cancelada'
      });
    }

    logger.info(`Reservation cancelled: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Reserva cancelada exitosamente',
      reservation: cancelledReservation
    });

  } catch (error) {
    logger.error('Cancel reservation error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo cancelar la reserva'
    });
  }
});

// Check-in to reservation (Reception role)
router.post('/:id/checkin', authenticateToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Only reception or admin can check-in
    if (req.user.role !== 'recepcion' && req.user.role !== 'administrador') {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'Solo el personal de recepción puede realizar check-in'
      });
    }

    const checkedInReservation = await Reservation.checkIn(id);

    if (!checkedInReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva no existe o no está aprobada'
      });
    }

    logger.info(`Reservation checked in: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Check-in realizado exitosamente',
      reservation: checkedInReservation
    });

  } catch (error) {
    logger.error('Check-in reservation error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo realizar el check-in'
    });
  }
});

// Mark as no-show (Reception role)
router.post('/:id/noshow', authenticateToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Only reception or admin can mark no-show
    if (req.user.role !== 'recepcion' && req.user.role !== 'administrador') {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'Solo el personal de recepción puede marcar no-show'
      });
    }

    const noShowReservation = await Reservation.markNoShow(id);

    if (!noShowReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva no existe o no está aprobada'
      });
    }

    logger.info(`Reservation marked as no-show: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Reserva marcada como no-show',
      reservation: noShowReservation
    });

  } catch (error) {
    logger.error('Mark no-show error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo marcar como no-show'
    });
  }
});

// Confirm completion (Reception role)
router.post('/:id/complete', authenticateToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Only reception or admin can confirm completion
    if (req.user.role !== 'recepcion' && req.user.role !== 'administrador') {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'Solo el personal de recepción puede confirmar finalización'
      });
    }

    const completedReservation = await Reservation.confirmCompletion(id);

    if (!completedReservation) {
      return res.status(404).json({
        error: 'Reserva no encontrada',
        message: 'La reserva no existe o no está aprobada'
      });
    }

    logger.info(`Reservation completed: ${id} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Reunión finalizada. Recuerde: apagar luces, apagar proyector y cerrar la sala con seguro.',
      reservation: completedReservation
    });

  } catch (error) {
    logger.error('Complete reservation error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo confirmar la finalización'
    });
  }
});

// Get calendar view
router.get('/calendar/view', authenticateToken, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate, roomId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const calendarData = await Reservation.getCalendarView(startDate, endDate, roomId);

    res.json({
      success: true,
      period: {
        startDate,
        endDate
      },
      roomId: roomId || 'all',
      events: calendarData
    });

  } catch (error) {
    logger.error('Get calendar view error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la vista de calendario'
    });
  }
});

// Get pending approvals (Approver only)
router.get('/pending/approvals', authenticateToken, requireApprover, async (req, res) => {
  try {
    const pendingReservations = await Reservation.getPendingApprovals();

    res.json({
      success: true,
      count: pendingReservations.length,
      reservations: pendingReservations
    });

  } catch (error) {
    logger.error('Get pending approvals error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener las reservas pendientes'
    });
  }
});

// Get upcoming reservations
router.get('/upcoming/list', authenticateToken, async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    
    const upcomingReservations = await Reservation.getUpcomingReservations(parseInt(hours));

    res.json({
      success: true,
      count: upcomingReservations.length,
      nextHours: parseInt(hours),
      reservations: upcomingReservations
    });

  } catch (error) {
    logger.error('Get upcoming reservations error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener las próximas reservas'
    });
  }
});

module.exports = router;
