const nodemailer = require('nodemailer');
const db = require('../database/connection');
const User = require('../models/User');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      this.transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Email transporter verification failed:', error);
        } else {
          logger.info('Email transporter ready');
        }
      });
    } else {
      logger.warn('Email configuration not found. Email notifications will be disabled.');
    }
  }

  async createNotification(userId, reservationId, type, title, message) {
    try {
      const query = `
        INSERT INTO notifications (user_id, reservation_id, type, title, message)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      
      const result = await db.query(query, [userId, reservationId, type, title, message]);
      return result.rows[0];
    } catch (error) {
      logger.error('Create notification error:', error);
      throw error;
    }
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      logger.warn('Email transporter not configured. Skipping email send.');
      return false;
    }

    try {
      const mailOptions = {
        from: `"${process.env.COMPANY_NAME || 'Autoquímicos'}" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Send email error:', error);
      return false;
    }
  }

  async notifyNewReservation(reservation) {
    try {
      // Get all approvers
      const approvers = await User.getUsersByRole('aprobador');
      const admins = await User.getUsersByRole('administrador');
      const notifyUsers = [...approvers, ...admins];

      const title = 'Nueva solicitud de reserva';
      const message = `Se ha creado una nueva solicitud de reserva para la sala ${reservation.room_name} el ${new Date(reservation.start_time).toLocaleDateString('es-MX')} de ${new Date(reservation.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} a ${new Date(reservation.end_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.`;

      // Create internal notifications
      for (const user of notifyUsers) {
        await this.createNotification(
          user.id,
          reservation.id,
          'reservation_created',
          title,
          message
        );
      }

      // Send emails
      if (this.transporter) {
        const emailSubject = `${title} - ${reservation.title}`;
        const emailHtml = `
          <h2>${title}</h2>
          <p>Estimado/a aprobador/a,</p>
          <p>Se ha recibido una nueva solicitud de reserva que requiere su aprobación:</p>
          <ul>
            <li><strong>Título:</strong> ${reservation.title}</li>
            <li><strong>Organizador:</strong> ${reservation.organizer_name}</li>
            <li><strong>Sala:</strong> ${reservation.room_name}</li>
            <li><strong>Fecha:</strong> ${new Date(reservation.start_time).toLocaleDateString('es-MX')}</li>
            <li><strong>Horario:</strong> ${new Date(reservation.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${new Date(reservation.end_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</li>
            <li><strong>Asistentes:</strong> ${reservation.attendees_count}</li>
            ${reservation.coffee_break === 'solicitado' ? '<li><strong>Coffee Break:</strong> Solicitado</li>' : ''}
          </ul>
          <p>Por favor, revise y apruebe o rechace esta solicitud en el sistema.</p>
          <p>Saludos,<br>${process.env.COMPANY_NAME || 'Autoquímicos S.A. de C.V.'}</p>
        `;

        for (const user of notifyUsers) {
          await this.sendEmail(user.email, emailSubject, emailHtml);
        }
      }

      logger.info(`Notifications sent for new reservation: ${reservation.id}`);
    } catch (error) {
      logger.error('Notify new reservation error:', error);
    }
  }

  async notifyReservationApproved(reservation) {
    try {
      const title = 'Reserva aprobada';
      const message = `Su reserva para la sala ${reservation.room_name} el ${new Date(reservation.start_time).toLocaleDateString('es-MX')} ha sido aprobada.`;

      // Create internal notification
      await this.createNotification(
        reservation.user_id,
        reservation.id,
        'reservation_approved',
        title,
        message
      );

      // Send email
      if (this.transporter) {
        const user = await User.findById(reservation.user_id);
        if (user) {
          const emailSubject = `${title} - ${reservation.title}`;
          const emailHtml = `
            <h2>${title}</h2>
            <p>Estimado/a ${user.first_name},</p>
            <p>Su solicitud de reserva ha sido <strong>aprobada</strong>:</p>
            <ul>
              <li><strong>Título:</strong> ${reservation.title}</li>
              <li><strong>Sala:</strong> ${reservation.room_name}</li>
              <li><strong>Fecha:</strong> ${new Date(reservation.start_time).toLocaleDateString('es-MX')}</li>
              <li><strong>Horario:</strong> ${new Date(reservation.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${new Date(reservation.end_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</li>
              <li><strong>Ubicación:</strong> ${reservation.room_location}</li>
            </ul>
            <p>Recuerde llegar puntualmente y realizar el check-in en recepción.</p>
            <p>Saludos,<br>${process.env.COMPANY_NAME || 'Autoquímicos S.A. de C.V.'}</p>
          `;

          await this.sendEmail(user.email, emailSubject, emailHtml);
        }
      }

      logger.info(`Approval notification sent for reservation: ${reservation.id}`);
    } catch (error) {
      logger.error('Notify reservation approved error:', error);
    }
  }

  async notifyReservationRejected(reservation) {
    try {
      const title = 'Reserva rechazada';
      const message = `Su reserva para la sala ${reservation.room_name} el ${new Date(reservation.start_time).toLocaleDateString('es-MX')} ha sido rechazada. Motivo: ${reservation.rejection_reason}`;

      // Create internal notification
      await this.createNotification(
        reservation.user_id,
        reservation.id,
        'reservation_rejected',
        title,
        message
      );

      // Send email
      if (this.transporter) {
        const user = await User.findById(reservation.user_id);
        if (user) {
          const emailSubject = `${title} - ${reservation.title}`;
          const emailHtml = `
            <h2>${title}</h2>
            <p>Estimado/a ${user.first_name},</p>
            <p>Lamentamos informarle que su solicitud de reserva ha sido <strong>rechazada</strong>:</p>
            <ul>
              <li><strong>Título:</strong> ${reservation.title}</li>
              <li><strong>Sala:</strong> ${reservation.room_name}</li>
              <li><strong>Fecha:</strong> ${new Date(reservation.start_time).toLocaleDateString('es-MX')}</li>
              <li><strong>Horario:</strong> ${new Date(reservation.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${new Date(reservation.end_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</li>
              <li><strong>Motivo del rechazo:</strong> ${reservation.rejection_reason}</li>
            </ul>
            <p>Si tiene alguna pregunta, por favor contacte al administrador del sistema.</p>
            <p>Saludos,<br>${process.env.COMPANY_NAME || 'Autoquímicos S.A. de C.V.'}</p>
          `;

          await this.sendEmail(user.email, emailSubject, emailHtml);
        }
      }

      logger.info(`Rejection notification sent for reservation: ${reservation.id}`);
    } catch (error) {
      logger.error('Notify reservation rejected error:', error);
    }
  }

  async notifyUpcomingReservation(reservation, minutesBefore = 30) {
    try {
      const title = 'Recordatorio de reunión';
      const message = `Su reunión en la sala ${reservation.room_name} comenzará en ${minutesBefore} minutos.`;

      // Create internal notification
      await this.createNotification(
        reservation.user_id,
        reservation.id,
        'reservation_reminder',
        title,
        message
      );

      logger.info(`Reminder notification sent for reservation: ${reservation.id}`);
    } catch (error) {
      logger.error('Notify upcoming reservation error:', error);
    }
  }

  async getUserNotifications(userId, limit = 50, unreadOnly = false) {
    try {
      let query = `
        SELECT * FROM notifications 
        WHERE user_id = $1
      `;
      const params = [userId];

      if (unreadOnly) {
        query += ` AND is_read = false`;
      }

      query += ` ORDER BY sent_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Get user notifications error:', error);
      throw error;
    }
  }

  async markNotificationAsRead(notificationId, userId) {
    try {
      const query = `
        UPDATE notifications 
        SET is_read = true, read_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await db.query(query, [notificationId, userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Mark notification as read error:', error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId) {
    try {
      const query = `
        UPDATE notifications 
        SET is_read = true, read_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND is_read = false
        RETURNING COUNT(*) as updated_count
      `;
      
      const result = await db.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Mark all notifications as read error:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();
