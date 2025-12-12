/* ============================================================
   CREACIÓN DE BASE DE DATOS
============================================================ */
CREATE DATABASE IF NOT EXISTS gestion_salas;
USE gestion_salas;


/* ============================================================
   TABLA: roles
============================================================ */
CREATE TABLE roles (
    id_rol INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);


/* ============================================================
   TABLA: usuarios
============================================================ */
CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(120) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    id_rol INT NOT NULL,
    activo TINYINT DEFAULT 1,
    password_hash TEXT NOT NULL,

    CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol)
        REFERENCES roles(id_rol)
);

CREATE INDEX idx_usuario_rol ON usuarios(id_rol);
CREATE INDEX idx_usuario_activo ON usuarios(activo);



/* ============================================================
   TABLA: salas
============================================================ */
CREATE TABLE salas (
    id_sala INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    capacidad INT NOT NULL,
    descripcion TEXT,
    activa TINYINT DEFAULT 1
);

CREATE INDEX idx_sala_activa ON salas(activa);



/* ============================================================
   TABLA: estados_reserva
============================================================ */
CREATE TABLE estados_reserva (
    id_estado INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);



/* ============================================================
   TABLA PRINCIPAL: reservas
============================================================ */
CREATE TABLE reservas (
    id_reserva INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_sala INT NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    asistentes INT NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    id_estado INT NOT NULL,
    requiere_coffee TINYINT DEFAULT 0,
    motivo_cancelacion VARCHAR(255),
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP 
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_reserva_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_reserva_sala FOREIGN KEY (id_sala)
        REFERENCES salas(id_sala),

    CONSTRAINT fk_reserva_estado FOREIGN KEY (id_estado)
        REFERENCES estados_reserva(id_estado)
);

/* ÍNDICES INTELIGENTES */
CREATE INDEX idx_reserva_fecha ON reservas(fecha);
CREATE INDEX idx_reserva_sala_fecha ON reservas(id_sala, fecha);
CREATE INDEX idx_reserva_usuario ON reservas(id_usuario);
CREATE INDEX idx_reserva_estado ON reservas(id_estado);
CREATE INDEX idx_reserva_rango ON reservas(fecha, hora_inicio, hora_fin);
CREATE INDEX idx_reserva_coffee ON reservas(requiere_coffee);



/* ============================================================
   TABLA: coffee_break
============================================================ */
CREATE TABLE coffee_break (
    id_coffee INT AUTO_INCREMENT PRIMARY KEY,
    id_reserva INT NOT NULL UNIQUE,
    hora_servicio TIME,
    notas VARCHAR(255),

    CONSTRAINT fk_coffee_reserva FOREIGN KEY (id_reserva)
        REFERENCES reservas(id_reserva)
        ON DELETE CASCADE
);

CREATE INDEX idx_coffee_hora ON coffee_break(hora_servicio);



/* ============================================================
   TABLA: checkin_registro
============================================================ */
CREATE TABLE checkin_registro (
    id_checkin INT AUTO_INCREMENT PRIMARY KEY,
    id_reserva INT NOT NULL,
    fecha_hora_checkin DATETIME,
    valido TINYINT DEFAULT 0,
    tolerancia_minutos INT DEFAULT 10,

    CONSTRAINT fk_checkin_reserva FOREIGN KEY (id_reserva)
        REFERENCES reservas(id_reserva)
        ON DELETE CASCADE
);

CREATE INDEX idx_checkin_reserva ON checkin_registro(id_reserva);
CREATE INDEX idx_checkin_valido ON checkin_registro(valido);



/* ============================================================
   TABLA: notificaciones
============================================================ */
CREATE TABLE notificaciones (
    id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(100) NOT NULL,
    mensaje TEXT NOT NULL,
    leida TINYINT DEFAULT 0,
    fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notificacion_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario)
);

CREATE INDEX idx_notif_usuario ON notificaciones(id_usuario);
CREATE INDEX idx_notif_leida ON notificaciones(leida);
CREATE INDEX idx_notif_fecha ON notificaciones(fecha_envio);



/* ============================================================
   TABLA: logs_auditoria
============================================================ */
CREATE TABLE logs_auditoria (
    id_log INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    accion VARCHAR(255) NOT NULL,
    tabla_afectada VARCHAR(50),
    id_registro INT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_log_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario)
);

CREATE INDEX idx_auditoria_usuario ON logs_auditoria(id_usuario);
CREATE INDEX idx_auditoria_fecha ON logs_auditoria(fecha);



/* ============================================================
   TABLA: config_sistema
============================================================ */
CREATE TABLE config_sistema (
    clave VARCHAR(100) PRIMARY KEY,
    valor VARCHAR(100)
);



/* ============================================================
   SEED DATA
============================================================ */
INSERT INTO roles (nombre, descripcion) VALUES
('Administrador', 'Control total del sistema'),
('Aprobador', 'Aprueba o rechaza reservas'),
('Organizador', 'Crea y gestiona reservas'),
('Recepción', 'Monitorea salas y check-ins');

INSERT INTO estados_reserva (nombre) VALUES
('Pendiente'),
('Aprobada'),
('Rechazada'),
('Cancelada'),
('No-show'),
('En Curso'),
('Finalizada');

INSERT INTO salas (nombre, capacidad, descripcion) VALUES
('Sala Ejecutiva', 8, 'Sala para reuniones ejecutivas'),
('Sala de Consejo', 12, 'Sala para juntas y presentaciones');

INSERT INTO config_sistema (clave, valor) VALUES
('tolerancia_checkin', '10'),
('hora_inicio_coffee', '09:30'),
('hora_fin_coffee', '13:00'),
('reserva_anticipacion_min_horas', '3');



/* ============================================================
   TRIGGER 1: AUDITORÍA DE CREACIÓN
============================================================ */
DELIMITER $$
CREATE TRIGGER trg_reserva_creada
AFTER INSERT ON reservas
FOR EACH ROW
BEGIN
    INSERT INTO logs_auditoria(id_usuario, accion, tabla_afectada, id_registro)
    VALUES (NEW.id_usuario, 'Creación de reserva', 'reservas', NEW.id_reserva);
END$$
DELIMITER ;



/* ============================================================
   TRIGGER 2: AUDITORÍA DE MODIFICACIÓN
============================================================ */
DELIMITER $$
CREATE TRIGGER trg_reserva_modificada
AFTER UPDATE ON reservas
FOR EACH ROW
BEGIN
    INSERT INTO logs_auditoria(id_usuario, accion, tabla_afectada, id_registro)
    VALUES (NEW.id_usuario, 'Modificación de reserva', 'reservas', NEW.id_reserva);
END$$
DELIMITER ;



/* ============================================================
   TRIGGER 3: NOTIFICACIÓN AUTOMÁTICA AL CREAR RESERVA
============================================================ */
DELIMITER $$
CREATE TRIGGER trg_notif_nueva_reserva
AFTER INSERT ON reservas
FOR EACH ROW
BEGIN
    INSERT INTO notificaciones(id_usuario, titulo, mensaje)
    VALUES (
        1,  -- ID del administrador
        'Nueva solicitud de reserva',
        CONCAT('El usuario ', NEW.id_usuario,
               ' solicitó la sala ', NEW.id_sala)
    );
END$$
DELIMITER ;



/* ============================================================
   TRIGGER 4: CHECK-IN → Cambiar estado a "En Curso"
============================================================ */
DELIMITER $$
CREATE TRIGGER trg_checkin_valido
AFTER INSERT ON checkin_registro
FOR EACH ROW
BEGIN
    UPDATE reservas
    SET id_estado = 6  -- En Curso
    WHERE id_reserva = NEW.id_reserva;
END$$
DELIMITER ;



/* ============================================================
   TRIGGER 5 (MUY IMPORTANTE): EVITAR DOBLE RESERVA
============================================================ */
DELIMITER $$
CREATE TRIGGER trg_evitar_conflictos_horarios
BEFORE INSERT ON reservas
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1 FROM reservas
        WHERE id_sala = NEW.id_sala
          AND fecha = NEW.fecha
          AND id_estado NOT IN (4,5,7) -- excluye cancelada, no-show y finalizada
          AND (
                (NEW.hora_inicio BETWEEN hora_inicio AND hora_fin)
             OR (NEW.hora_fin BETWEEN hora_inicio AND hora_fin)
             OR (hora_inicio BETWEEN NEW.hora_inicio AND NEW.hora_fin)
          )
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Conflicto de horario: la sala ya está reservada.';
    END IF;
END$$
DELIMITER ;



/* ============================================================
   EVENTO 1: AUTO-MARCAR NO-SHOW
============================================================ */
SET GLOBAL event_scheduler = ON;

DELIMITER $$
CREATE EVENT IF NOT EXISTS ev_detectar_no_show
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
    UPDATE reservas r
    LEFT JOIN checkin_registro c ON r.id_reserva = c.id_reserva
    JOIN config_sistema cfg ON cfg.clave = 'tolerancia_checkin'
    SET r.id_estado = 5  -- No-show
    WHERE r.id_estado = 2
      AND c.id_checkin IS NULL
      AND TIMESTAMP(r.fecha, r.hora_inicio) <
          DATE_SUB(NOW(), INTERVAL cfg.valor MINUTE);
END$$
DELIMITER ;



/* ============================================================
   EVENTO 2: FINALIZAR REUNIONES
============================================================ */
DELIMITER $$
CREATE EVENT IF NOT EXISTS ev_finalizar_reservas
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
    UPDATE reservas
    SET id_estado = 7
    WHERE id_estado IN (2,6)
      AND TIMESTAMP(fecha, hora_fin) < NOW();
END$$
DELIMITER ;
