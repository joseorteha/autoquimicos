# Sistema de Gestión de Salas - Autoquímicos S.A. de C.V.

Sistema completo para la gestión de salas de conferencias con backend Node.js y frontend Angular (próximamente).

## Estructura del Proyecto

```
autoquimicos/
├── backend/          # API REST con Node.js + Express + MySQL
└── frontend/         # Aplicación Angular (próximamente)
```

## Backend

Sistema de API RESTful para gestión de salas de conferencias.

**Tecnologías:**
- Node.js + Express
- MySQL/MariaDB
- JWT Authentication
- Swagger UI para documentación
- Winston para logging

**Ver:** [backend/README.md](./backend/README.md)

**Documentación API:** `http://localhost:3000/api/docs` (cuando el servidor esté corriendo)

### Inicio Rápido - Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con credenciales de BD
node src/database/seed-admin.js
npm start
```

**Credenciales de prueba:**
- Email: `admin@autoquimicos.com`
- Password: `admin123`

## Frontend (Próximamente)

Aplicación Angular para la interfaz de usuario del sistema.

## Características del Sistema

- ✅ Gestión de reservas de salas
- ✅ Sistema de roles (Admin, Aprobador, Organizador, Recepción)
- ✅ Control de disponibilidad
- ✅ Coffee break automático
- ✅ Check-in y control de asistencia
- ✅ Reportes y estadísticas
- ✅ Auditoría completa
- ✅ Notificaciones

## Licencia

Sistema propietario de Autoquímicos S.A. de C.V.
