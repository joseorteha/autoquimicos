require('dotenv').config();
const db = require('../database/connection');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
    try {
        console.log('🔧 Creando usuario administrador de prueba...\n');

        // Verificar si ya existe el usuario
        const checkQuery = `SELECT * FROM usuarios WHERE correo = 'admin@autoquimicos.com'`;
        const checkResult = await db.query(checkQuery);

        if (checkResult.rows.length > 0) {
            console.log('⚠️  El usuario admin@autoquimicos.com ya existe');
            console.log('📝 Email: admin@autoquimicos.com');
            console.log('🔑 Password: admin123');
            console.log('');
            process.exit(0);
        }

        // Hash password
        const passwordHash = await bcrypt.hash('admin123', 10);

        // Obtener ID del rol Administrador
        const roleQuery = `SELECT id_rol FROM roles WHERE nombre = 'Administrador'`;
        const roleResult = await db.query(roleQuery);

        if (roleResult.rows.length === 0) {
            console.error('❌ Error: No se encontró el rol "Administrador"');
            process.exit(1);
        }

        const roleId = roleResult.rows[0].id_rol;

        // Crear usuario
        const insertQuery = `
      INSERT INTO usuarios (nombre, correo, telefono, id_rol, password_hash, activo)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

        await db.query(insertQuery, [
            'Administrador',
            'admin@autoquimicos.com',
            '555-0100',
            roleId,
            passwordHash,
            1
        ]);

        console.log('✅ ¡Usuario administrador creado exitosamente!');
        console.log('');
        console.log('📝 Credenciales:');
        console.log('   Email: admin@autoquimicos.com');
        console.log('   Password: admin123');
        console.log('');
        console.log('🎯 Ahora puedes probar el login en Swagger UI:');
        console.log('   http://localhost:3000/api/docs');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error al crear usuario:', error.message);
        process.exit(1);
    }
}

createAdminUser();
