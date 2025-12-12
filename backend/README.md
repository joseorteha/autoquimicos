# Sistema de Gestión de Salas de Conferencias - Autoquímicos S.A. de C.V.

## Descripción

Sistema backend para la gestión centralizada de las salas de conferencias "Sala Ejecutiva" y "Sala de Consejo" de Autoquímicos S.A. de C.V. El sistema reemplaza el flujo actual de Microsoft Teams con una plataforma que garantiza orden, trazabilidad y uso eficiente de las salas.

## Características Principales

### Funcionalidades Core
- **Gestión de Reservas**: Creación, modificación, aprobación y cancelación de reservas
- **Control de Disponibilidad**: Verificación automática de conflictos de horarios
- **Sistema de Roles**: Administrador, Aprobador, Organizador y Recepción
- **Validaciones de Negocio**: Anticipación mínima de 3 horas, horarios laborales
- **Coffee Break**: Gestión automática según duración y horarios
- **Check-in/No-show**: Control de asistencia y finalización de reuniones

### Características Técnicas
- **Autenticación JWT**: Sistema seguro de autenticación y autorización
- **Auditoría Completa**: Registro detallado de todas las acciones
- **Notificaciones**: Sistema interno y por email
- **Reportes**: Estadísticas de uso, utilización de salas y actividad de usuarios
- **API RESTful**: Endpoints bien documentados y estructurados

## Tecnologías

- **Backend**: Node.js con Express.js
- **Base de Datos**: MySQL
- **Autenticación**: JWT (JSON Web Tokens)
- **Logging**: Winston
- **Email**: Nodemailer
- **Validación**: Express-validator
- **Seguridad**: Helmet, CORS, Rate Limiting

## Estructura del Proyecto

```
backend/
├── src/
│   ├── app.js                 # Aplicación principal
│   ├── database/
│   │   ├── connection.js      # Configuración de PostgreSQL
│   │   ├── schema.sql         # Esquema de base de datos
│   │   ├── seed.sql           # Datos iniciales
│   │   └── migrate.js         # Script de migración
│   ├── models/
│   │   ├── User.js            # Modelo de usuarios
│   │   ├── Room.js            # Modelo de salas
│   │   └── Reservation.js     # Modelo de reservas
│   ├── routes/
│   │   ├── auth.js            # Rutas de autenticación
│   │   ├── users.js           # Rutas de usuarios
│   │   ├── rooms.js           # Rutas de salas
│   │   ├── reservations.js    # Rutas de reservas
│   │   ├── reports.js         # Rutas de reportes
│   │   └── audit.js           # Rutas de auditoría
│   ├── middleware/
│   │   ├── auth.js            # Middleware de autenticación
│   │   ├── validation.js      # Validaciones
│   │   └── errorHandler.js    # Manejo de errores
│   ├── services/
│   │   ├── notificationService.js  # Servicio de notificaciones
│   │   └── auditService.js         # Servicio de auditoría
│   └── utils/
│       └── logger.js          # Configuración de logging
├── logs/                      # Archivos de log
├── package.json
├── .env.example
└── README.md
```

## Instalación y Configuración

### Prerrequisitos
- Node.js (v16 o superior)
- MySQL (v8.0 o superior)
- npm o yarn

### Pasos de Instalación

1. **Clonar e instalar dependencias**:
```bash
cd backend
npm install
```

2. **Configurar variables de entorno**:
```bash
cp .env.example .env
# Editar .env con sus configuraciones
```

3. **Configurar base de datos**:
```bash
# Crear base de datos MySQL
mysql -u root -p
CREATE DATABASE autoquimicos_salas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit

# Ejecutar migraciones
npm run migrate
```

4. **Iniciar el servidor**:
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## Variables de Entorno

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=autoquimicos_salas
DB_USER=root
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@company.com
EMAIL_PASSWORD=your_email_password

# Company Configuration
COMPANY_NAME=Autoquímicos S.A. de C.V.
COMPANY_EMAIL=admin@autoquimicos.com
```

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/refresh` - Renovar token
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/verify` - Verificar token

### Usuarios
- `GET /api/users/profile` - Obtener perfil actual
- `PUT /api/users/profile` - Actualizar perfil
- `GET /api/users` - Listar usuarios (Admin/Aprobador)
- `POST /api/users` - Crear usuario (Admin)
- `PUT /api/users/:id` - Actualizar usuario (Admin)
- `DELETE /api/users/:id` - Desactivar usuario (Admin)

### Salas
- `GET /api/rooms` - Listar salas
- `GET /api/rooms/:id` - Obtener sala por ID
- `POST /api/rooms` - Crear sala (Admin)
- `PUT /api/rooms/:id` - Actualizar sala (Admin)
- `DELETE /api/rooms/:id` - Desactivar sala (Admin)
- `GET /api/rooms/:id/availability` - Verificar disponibilidad
- `GET /api/rooms/available/search` - Buscar salas disponibles

### Reservas
- `GET /api/reservations` - Listar reservas
- `GET /api/reservations/:id` - Obtener reserva por ID
- `POST /api/reservations` - Crear reserva
- `PUT /api/reservations/:id` - Actualizar reserva
- `POST /api/reservations/:id/approve` - Aprobar reserva (Aprobador)
- `POST /api/reservations/:id/reject` - Rechazar reserva (Aprobador)
- `POST /api/reservations/:id/cancel` - Cancelar reserva
- `POST /api/reservations/:id/checkin` - Check-in (Recepción)
- `POST /api/reservations/:id/noshow` - Marcar no-show (Recepción)
- `POST /api/reservations/:id/complete` - Confirmar finalización (Recepción)
- `GET /api/reservations/calendar/view` - Vista de calendario
- `GET /api/reservations/pending/approvals` - Reservas pendientes (Aprobador)

### Reportes
- `GET /api/reports/reservations/summary` - Resumen de reservas
- `GET /api/reports/rooms/utilization` - Utilización de salas
- `GET /api/reports/users/activity` - Actividad de usuarios
- `GET /api/reports/departments/stats` - Estadísticas por departamento
- `GET /api/reports/coffee-break/stats` - Estadísticas de coffee break
- `GET /api/reports/usage/daily-pattern` - Patrón de uso diario

### Auditoría
- `GET /api/audit` - Registros de auditoría
- `GET /api/audit/reservation/:id` - Historial de reserva
- `GET /api/audit/user/:id/activity` - Actividad de usuario
- `GET /api/audit/system/activity` - Actividad del sistema

## Roles y Permisos

### Administrador
- Acceso completo al sistema
- Gestión de usuarios y salas
- Visualización de todos los reportes y auditorías
- Aprobación de reservas

### Aprobador
- Aprobación/rechazo de reservas
- Visualización de reportes
- Acceso a auditorías
- Gestión de sus propias reservas

### Organizador
- Creación y gestión de sus propias reservas
- Visualización de disponibilidad de salas
- Acceso limitado a reportes propios

### Recepción
- Check-in y no-show de reservas
- Confirmación de finalización de reuniones
- Visualización de reservas del día

## Reglas de Negocio

### Reservas
- **Anticipación mínima**: 3 horas
- **Horario laboral**: 7:00 AM - 7:00 PM
- **Días laborales**: Lunes a viernes
- **Duración máxima**: 8 horas por reserva
- **Sin traslapes**: Verificación automática de conflictos

### Coffee Break
- **No aplica**: Reuniones menores a 1 hora
- **Opcional**: Reuniones de 1+ horas entre 9:30 AM - 1:00 PM
- **Incluye agua**: Todas las salas incluyen agua

### Notificaciones
- **Nueva reserva**: Notificación a administradores y aprobadores
- **Aprobación/Rechazo**: Notificación al organizador
- **Recordatorios**: 30 minutos antes de la reunión

## Seguridad

- **Autenticación JWT**: Tokens seguros con expiración
- **Autorización por roles**: Permisos granulares
- **Rate limiting**: Protección contra ataques
- **Validación de entrada**: Sanitización de datos
- **Logging de seguridad**: Registro de intentos fallidos
- **Auditoría completa**: Trazabilidad de todas las acciones

## Monitoreo y Logs

- **Winston Logger**: Sistema de logging estructurado
- **Niveles de log**: Error, Warn, Info, Debug
- **Rotación de archivos**: Archivos de log con límite de tamaño
- **Auditoría de acciones**: Registro detallado en base de datos

## Desarrollo

### Scripts disponibles
```bash
npm start          # Iniciar en producción
npm run dev        # Iniciar en desarrollo con nodemon
npm run migrate    # Ejecutar migraciones de BD
npm run seed       # Insertar datos iniciales
npm test           # Ejecutar pruebas (cuando estén implementadas)
```

### Estructura de respuestas API
```json
{
  "success": true,
  "message": "Operación exitosa",
  "data": { ... },
  "count": 10,
  "pagination": { ... }
}
```

### Manejo de errores
```json
{
  "success": false,
  "error": "Tipo de error",
  "message": "Descripción del error",
  "details": [ ... ]
}
```

## Soporte

Para soporte técnico o consultas sobre el sistema, contactar al equipo de desarrollo o al administrador del sistema.

## Licencia

Sistema propietario de Autoquímicos S.A. de C.V.
