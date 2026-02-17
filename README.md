# Centro Social en Línea – Mentes Fuertes (UCN)

Aplicación web responsive con:
- Registro / inicio de sesión
- Roles: **student** y **admin**
- Cuestionario de bienestar (con mensaje informativo obligatorio)
- Clasificación automática (normal / en riesgo / crítico) con heurística editable
- Panel Admin para ver casos, agregar notas, y enviar correo de seguimiento
- Chat interno solo para administradores
- Base de datos SQLite (archivo local)

> Nota: la clasificación es automática y **no sustituye** evaluación clínica.

## Requisitos
- Node.js 18+

## Instalación

```bash
npm install
```

Copia el archivo `.env.example` a `.env` y edítalo:

```bash
cp .env.example .env
```

## Crear administrador inicial

```bash
npm run seed
```

Por defecto crea:
- Email: `admin@ucn.local`
- Password: `Admin1234`

(Puedes cambiarlo en `.env` con `SEED_ADMIN_*`.)

## Ejecutar

```bash
npm start
```

Abre:
- http://localhost:3000

## Envío de correos
Para habilitar el botón **Enviar correo** en el panel admin, configura:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

Si usas Gmail, normalmente necesitas una **App Password**.

## Dónde editar la lógica de riesgo
`src/lib/risk.js`

## Estructura
- `server.js` servidor Express
- `db/` base de datos y schema
- `views/` vistas EJS
- `public/` estáticos (logo, css)

