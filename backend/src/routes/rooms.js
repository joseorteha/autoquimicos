const express = require('express');
const Room = require('../models/Room');
const { authenticateToken, requireAdmin, requireApprover } = require('../middleware/auth');
const { validateRoomCreation, validateUUID, validateDateRange } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Get all rooms
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rooms = await Room.findAll();

    res.json({
      success: true,
      count: rooms.length,
      rooms
    });

  } catch (error) {
    logger.error('Get rooms error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la lista de salas'
    });
  }
});

// Get room by ID
router.get('/:id', authenticateToken, validateUUID, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        error: 'Sala no encontrada',
        message: 'La sala especificada no existe'
      });
    }

    res.json({
      success: true,
      room
    });

  } catch (error) {
    logger.error('Get room by ID error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la sala'
    });
  }
});

// Create new room (Admin only)
router.post('/', authenticateToken, requireAdmin, validateRoomCreation, async (req, res) => {
  try {
    const roomData = req.body;
    
    const newRoom = await Room.create(roomData);

    logger.info(`New room created: ${newRoom.name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Sala creada exitosamente',
      room: newRoom
    });

  } catch (error) {
    logger.error('Create room error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        error: 'Sala ya existe',
        message: 'Ya existe una sala con este nombre'
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear la sala'
    });
  }
});

// Update room (Admin only)
router.put('/:id', authenticateToken, requireAdmin, validateUUID, validateRoomCreation, async (req, res) => {
  try {
    const { id } = req.params;
    const roomData = req.body;

    const updatedRoom = await Room.update(id, roomData);

    if (!updatedRoom) {
      return res.status(404).json({
        error: 'Sala no encontrada',
        message: 'No se pudo actualizar la sala'
      });
    }

    logger.info(`Room updated: ${updatedRoom.name} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Sala actualizada exitosamente',
      room: updatedRoom
    });

  } catch (error) {
    logger.error('Update room error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        error: 'Nombre duplicado',
        message: 'Ya existe una sala con este nombre'
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo actualizar la sala'
    });
  }
});

// Deactivate room (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const deactivatedRoom = await Room.deactivate(id);

    if (!deactivatedRoom) {
      return res.status(404).json({
        error: 'Sala no encontrada',
        message: 'No se pudo desactivar la sala'
      });
    }

    logger.info(`Room deactivated: ${deactivatedRoom.name} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'Sala desactivada exitosamente',
      room: deactivatedRoom
    });

  } catch (error) {
    logger.error('Deactivate room error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo desactivar la sala'
    });
  }
});

// Check room availability
router.get('/:id/availability', authenticateToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { startTime, endTime, excludeReservationId } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startTime y endTime'
      });
    }

    const isAvailable = await Room.checkAvailability(id, startTime, endTime, excludeReservationId);

    res.json({
      success: true,
      available: isAvailable,
      roomId: id,
      timeSlot: {
        startTime,
        endTime
      }
    });

  } catch (error) {
    logger.error('Check availability error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo verificar la disponibilidad'
    });
  }
});

// Get available rooms for a time slot
router.get('/available/search', authenticateToken, async (req, res) => {
  try {
    const { startTime, endTime, minCapacity } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startTime y endTime'
      });
    }

    const availableRooms = await Room.getAvailableRooms(startTime, endTime, minCapacity);

    res.json({
      success: true,
      count: availableRooms.length,
      timeSlot: {
        startTime,
        endTime
      },
      rooms: availableRooms
    });

  } catch (error) {
    logger.error('Get available rooms error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener las salas disponibles'
    });
  }
});

// Get room usage statistics (Admin and Approver only)
router.get('/:id/stats', authenticateToken, requireApprover, validateUUID, validateDateRange, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Parámetros requeridos',
        message: 'Se requieren startDate y endDate'
      });
    }

    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        error: 'Sala no encontrada',
        message: 'La sala especificada no existe'
      });
    }

    const stats = await Room.getRoomUsageStats(id, startDate, endDate);

    res.json({
      success: true,
      room: {
        id: room.id,
        name: room.name
      },
      period: {
        startDate,
        endDate
      },
      statistics: {
        totalReservations: parseInt(stats.total_reservations) || 0,
        completedReservations: parseInt(stats.completed_reservations) || 0,
        noShows: parseInt(stats.no_shows) || 0,
        averageDurationHours: parseFloat(stats.avg_duration_hours) || 0,
        totalHoursUsed: parseFloat(stats.total_hours_used) || 0,
        utilizationRate: stats.total_reservations > 0 ? 
          (stats.completed_reservations / stats.total_reservations * 100).toFixed(2) : 0
      }
    });

  } catch (error) {
    logger.error('Get room stats error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener las estadísticas de la sala'
    });
  }
});

module.exports = router;
