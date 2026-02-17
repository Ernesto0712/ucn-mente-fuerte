require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { openDb, initDb } = require('./db/db');
const authRoutes = require('./src/routes/auth');
const appRoutes = require('./src/routes/app');
const adminRoutes = require('./src/routes/admin');

const app = express();

// ✅ Render / proxies
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Sessions (si querés mantenerlo así por ahora)
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true, // si usas HTTPS siempre (Render sí), puedes activarlo luego
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

// Basic locals
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// Rate limit only for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/auth', authLimiter);

// Routes
app.use('/auth', authRoutes);
app.use('/', appRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('pages/404', { title: 'No encontrado' });
});

// ✅ Error handler para que NO se caiga el servidor (y puedas ver el error)
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).send('Error interno del servidor');
});

// ✅ Arrancar SOLO cuando la DB esté lista
async function start() {
  try {
    const db = openDb();
    await initDb(db);
    app.locals.db = db;

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('DB init error:', err);
    process.exit(1);
  }
}

start();
