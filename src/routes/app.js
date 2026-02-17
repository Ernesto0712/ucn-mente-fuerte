const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { all, get, run } = require('../../db/db');
const { classifyRisk } = require('../lib/risk');

const router = express.Router();

router.get('/', (req, res) => {
  const user = req.session.user;
  if (!user) return res.redirect('/auth/login');
  if (user.role === 'admin') return res.redirect('/admin');
  return res.redirect('/student');
});

router.get('/student', requireAuth, async (req, res) => {
  const user = req.session.user;
  if (user.role !== 'student') return res.redirect('/admin');

  const db = req.app.locals.db;
  const latest = await get(
    db,
    'SELECT id, risk_level, risk_score, created_at FROM questionnaires WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 1',
    [user.id]
  );

  res.render('pages/student/dashboard', { title: 'Panel del Estudiante', latest });
});

router.get('/student/form', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user.role !== 'student') return res.redirect('/admin');
  res.render('pages/student/form', { title: 'Cuestionario', prefaceAccepted: false, formData: {} });
});

router.post('/student/form', requireAuth, async (req, res) => {
  const user = req.session.user;
  if (user.role !== 'student') return res.redirect('/admin');

  const consented = req.body.consented === 'on' ? 1 : 0;
  if (!consented) {
    req.session.flash = { type: 'warning', message: 'Debes aceptar el mensaje informativo para continuar.' };
    return res.redirect('/student/form');
  }

  const answers = {
    q1: req.body.q1 || '',
    q2: req.body.q2 || '',
    q3: req.body.q3 || '',
    q4: req.body.q4 || '',
    q5: req.body.q5 || '',
    q6: req.body.q6 || '',
    q7: req.body.q7 || '',
    q8: req.body.q8 || '',
    q9: req.body.q9 || ''
  };

  const { score, level } = classifyRisk(answers);

  const db = req.app.locals.db;
  const r = await run(
    db,
    'INSERT INTO questionnaires (user_id, consented, answers_json, risk_score, risk_level) VALUES (?, ?, ?, ?, ?)',
    [user.id, consented, JSON.stringify(answers), score, level]
  );

  res.redirect(`/student/thanks?id=${r.lastID}`);
});

router.get('/student/thanks', requireAuth, async (req, res) => {
  const user = req.session.user;
  if (user.role !== 'student') return res.redirect('/admin');

  const db = req.app.locals.db;
  const q = await get(db, 'SELECT id, risk_level, risk_score, created_at FROM questionnaires WHERE id = ? AND user_id = ?', [
    req.query.id,
    user.id
  ]);

  if (!q) return res.redirect('/student');
  res.render('pages/student/thanks', { title: 'Gracias', q });
});

router.get('/student/history', requireAuth, async (req, res) => {
  const user = req.session.user;
  if (user.role !== 'student') return res.redirect('/admin');

  const db = req.app.locals.db;
  const rows = await all(
    db,
    'SELECT id, risk_level, risk_score, created_at FROM questionnaires WHERE user_id = ? ORDER BY datetime(created_at) DESC',
    [user.id]
  );

  res.render('pages/student/history', { title: 'Mis registros', rows });
});

module.exports = router;
