const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { get, run } = require('../../db/db');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('pages/auth/login', { title: 'Iniciar sesión' });
});

router.post(
  '/login',
  body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Contraseña inválida'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect('/auth/login');
    }

    const db = req.app.locals.db;
    const email = req.body.email;
    const password = req.body.password;

    // ✅ Postgres usa $1, $2...
    const user = await get(db, 'SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      req.session.flash = { type: 'error', message: 'Credenciales incorrectas.' };
      return res.redirect('/auth/login');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      req.session.flash = { type: 'error', message: 'Credenciales incorrectas.' };
      return res.redirect('/auth/login');
    }

    req.session.user = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
    return res.redirect('/');
  }
);

router.get('/register', (req, res) => {
  res.render('pages/auth/register', { title: 'Registro' });
});

router.post(
  '/register',
  body('full_name').trim().isLength({ min: 3 }).withMessage('Escribe tu nombre completo'),
  body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect('/auth/register');
    }

    const db = req.app.locals.db;
    const full_name = req.body.full_name;
    const email = req.body.email;

    const existing = await get(db, 'SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      req.session.flash = { type: 'error', message: 'Este correo ya está registrado.' };
      return res.redirect('/auth/register');
    }

    const password_hash = await bcrypt.hash(req.body.password, 12);

    // ✅ En Postgres, para obtener id necesitas RETURNING id
    const r = await run(
      db,
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [full_name, email, password_hash, 'student']
    );

    // r.insertId lo vamos a estandarizar en db.js
    req.session.user = { id: r.insertId, full_name, email, role: 'student' };
    req.session.flash = { type: 'success', message: 'Registro exitoso. ¡Bienvenido/a!' };
    return res.redirect('/');
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
