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

// ✅ Render / proxies (fix rate-limit + forwarded headers)
app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';

// DB
const db = openDb();
initDb(db).catch((err) => {
  console.error('DB init error:', err);
  process.exit(1);
});
app.locals.db = db;

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // keeping simple for CDN Tailwind
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// ✅ Sessions: SQLite en local, MemoryStore en producción (Render)
app.use(
  session({
    store: isProd
      ? undefined // MemoryStore (ok para demo/concurso) evita escribir archivos en Render
      : new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // en producción (https) => true
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
