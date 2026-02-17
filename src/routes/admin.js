const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const { requireRole } = require('../middleware/auth');
const { all, get, run } = require('../../db/db');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res) => {
  const db = req.app.locals.db;

  const stats = {
    total: (await get(db, 'SELECT COUNT(*)::int as c FROM questionnaires'))?.c || 0,
    critical: (await get(db, "SELECT COUNT(*)::int as c FROM questionnaires WHERE risk_level='critical'"))?.c || 0,
    at_risk: (await get(db, "SELECT COUNT(*)::int as c FROM questionnaires WHERE risk_level='at_risk'"))?.c || 0
  };

  const critical = await all(
    db,
    `SELECT q.id, q.risk_level, q.risk_score, q.created_at, u.full_name, u.email
     FROM questionnaires q
     JOIN users u ON u.id = q.user_id
     WHERE q.risk_level IN ('critical','at_risk')
     ORDER BY CASE q.risk_level WHEN 'critical' THEN 0 ELSE 1 END, q.created_at DESC
     LIMIT 50`
  );

  res.render('pages/admin/dashboard', { title: 'Panel Admin', stats, critical });
});

// Listado completo (para que el admin vea TODAS las respuestas)
router.get('/questionnaires', requireRole('admin'), async (req, res) => {
  const db = req.app.locals.db;
  const q = (req.query.q || '').trim();
  const level = (req.query.level || '').trim();

  const where = [];
  const params = [];

  if (level && ['normal', 'at_risk', 'critical'].includes(level)) {
    params.push(level);
    where.push(`q.risk_level = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const p1 = `$${params.length}`;
    params.push(`%${q}%`);
    const p2 = `$${params.length}`;
    where.push(`(u.full_name ILIKE ${p1} OR u.email ILIKE ${p2})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await all(
    db,
    `SELECT q.id, q.risk_level, q.risk_score, q.created_at, u.full_name, u.email
     FROM questionnaires q
     JOIN users u ON u.id = q.user_id
     ${whereSql}
     ORDER BY q.created_at DESC
     LIMIT 200`,
    params
  );

  res.render('pages/admin/questionnaires', {
    title: 'Respuestas (Admin)',
    rows,
    filters: { q, level }
  });
});

router.get('/questionnaires/:id', requireRole('admin'), async (req, res) => {
  const db = req.app.locals.db;
  const id = req.params.id;

  const qRow = await get(
    db,
    `SELECT q.*, u.full_name, u.email
     FROM questionnaires q
     JOIN users u ON u.id = q.user_id
     WHERE q.id = $1`,
    [id]
  );

  if (!qRow) return res.status(404).render('pages/404', { title: 'No encontrado' });

  const answers = JSON.parse(qRow.answers_json || '{}');

  const notes = await all(
    db,
    `SELECT f.*, a.full_name as admin_name
     FROM followups f
     JOIN users a ON a.id = f.admin_id
     WHERE f.questionnaire_id = $1
     ORDER BY f.created_at DESC`,
    [id]
  );

  res.render('pages/admin/questionnaire_detail', { title: 'Detalle', q: qRow, answers, notes });
});

// Actualizar clasificación de riesgo manualmente (el admin decide el estado)
router.post(
  '/questionnaires/:id/status',
  requireRole('admin'),
  body('risk_level').isIn(['normal', 'at_risk', 'critical']).withMessage('Estado inválido'),
  body('risk_score').optional({ checkFalsy: true }).isInt({ min: 0, max: 999 }).withMessage('Puntaje inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect(`/admin/questionnaires/${req.params.id}`);
    }

    const db = req.app.locals.db;
    const id = req.params.id;
    const risk_level = req.body.risk_level;
    const risk_score = req.body.risk_score ? Number(req.body.risk_score) : null;

    const exists = await get(db, 'SELECT id FROM questionnaires WHERE id = $1', [id]);
    if (!exists) return res.status(404).render('pages/404', { title: 'No encontrado' });

    if (risk_score === null) {
      await run(db, 'UPDATE questionnaires SET risk_level = $1 WHERE id = $2', [risk_level, id]);
    } else {
      await run(db, 'UPDATE questionnaires SET risk_level = $1, risk_score = $2 WHERE id = $3', [risk_level, risk_score, id]);
    }

    // Nota automática para trazabilidad
    await run(
      db,
      'INSERT INTO followups (questionnaire_id, admin_id, note) VALUES ($1, $2, $3)',
      [
        id,
        req.session.user.id,
        `Clasificación actualizada por admin → ${risk_level}${risk_score !== null ? ` (puntaje: ${risk_score})` : ''}`
      ]
    );

    req.session.flash = { type: 'success', message: 'Estado actualizado.' };
    res.redirect(`/admin/questionnaires/${id}`);
  }
);

router.post(
  '/questionnaires/:id/note',
  requireRole('admin'),
  body('note').trim().isLength({ min: 3 }).withMessage('Escribe una nota más detallada'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect(`/admin/questionnaires/${req.params.id}`);
    }

    const db = req.app.locals.db;
    await run(
      db,
      'INSERT INTO followups (questionnaire_id, admin_id, note) VALUES ($1, $2, $3)',
      [req.params.id, req.session.user.id, req.body.note]
    );

    req.session.flash = { type: 'success', message: 'Nota guardada.' };
    res.redirect(`/admin/questionnaires/${req.params.id}`);
  }
);

router.post(
  '/questionnaires/:id/email',
  requireRole('admin'),
  body('subject').trim().isLength({ min: 3 }).withMessage('Asunto requerido'),
  body('message').trim().isLength({ min: 10 }).withMessage('Mensaje muy corto'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect(`/admin/questionnaires/${req.params.id}`);
    }

    const db = req.app.locals.db;
    const qRow = await get(
      db,
      `SELECT q.id, u.email, u.full_name
       FROM questionnaires q
       JOIN users u ON u.id = q.user_id
       WHERE q.id = $1`,
      [req.params.id]
    );

    if (!qRow) return res.status(404).render('pages/404', { title: 'No encontrado' });

    const subject = req.body.subject;
    const message = req.body.message;

    // Log first
    const log = await run(
      db,
      'INSERT INTO email_logs (questionnaire_id, admin_id, to_email, subject, body, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [qRow.id, req.session.user.id, qRow.email, subject, message, 'queued']
    );

    // Compatibilidad: según cómo tu db.js devuelva RETURNING
    const logId = log?.id || log?.lastID || (log?.rows && log.rows[0]?.id);

    try {
      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 8px 0">Centro Social en Línea – Mentes Fuertes</h2>
          <p>Hola <b>${escapeHtml(qRow.full_name)}</b>,</p>
          <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
          <p style="margin-top:16px;color:#666">Este correo fue enviado desde la plataforma de seguimiento. Si consideras que estás en peligro inmediato, busca ayuda de emergencia local.</p>
        </div>
      `;

      await sendMail({ to: qRow.email, subject, html, text: message });

      if (logId) await run(db, 'UPDATE email_logs SET status = $1 WHERE id = $2', ['sent', logId]);
      req.session.flash = { type: 'success', message: 'Correo enviado.' };
    } catch (err) {
      if (logId) {
        await run(db, 'UPDATE email_logs SET status = $1, error = $2 WHERE id = $3', [
          'failed',
          String(err.message || err),
          logId
        ]);
      }
      req.session.flash = { type: 'error', message: `No se pudo enviar el correo: ${err.message || err}` };
    }

    res.redirect(`/admin/questionnaires/${req.params.id}`);
  }
);

router.get('/users', requireRole('admin'), async (req, res) => {
  const db = req.app.locals.db;
  const admins = await all(
    db,
    "SELECT id, full_name, email, created_at FROM users WHERE role='admin' ORDER BY created_at DESC"
  );
  res.render('pages/admin/users', { title: 'Administradores', admins });
});

router.post(
  '/users/create-admin',
  requireRole('admin'),
  body('full_name').trim().isLength({ min: 3 }).withMessage('Nombre requerido'),
  body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Contraseña mínima: 6 caracteres'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect('/admin/users');
    }

    const db = req.app.locals.db;
    const exists = await get(db, 'SELECT id FROM users WHERE email = $1', [req.body.email]);
    if (exists) {
      req.session.flash = { type: 'error', message: 'Ese correo ya existe.' };
      return res.redirect('/admin/users');
    }

    const hash = await bcrypt.hash(req.body.password, 12);
    await run(
      db,
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [req.body.full_name, req.body.email, hash, 'admin']
    );

    req.session.flash = { type: 'success', message: 'Administrador creado.' };
    res.redirect('/admin/users');
  }
);

router.get('/chat', requireRole('admin'), async (req, res) => {
  const db = req.app.locals.db;
  const messages = await all(
    db,
    `SELECT c.*, u.full_name
     FROM admin_chat c
     JOIN users u ON u.id = c.admin_id
     ORDER BY c.created_at DESC
     LIMIT 100`
  );
  res.render('pages/admin/chat', { title: 'Chat Admin', messages });
});

router.post(
  '/chat',
  requireRole('admin'),
  body('message').trim().isLength({ min: 1, max: 800 }).withMessage('Mensaje inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flash = { type: 'error', message: errors.array()[0].msg };
      return res.redirect('/admin/chat');
    }

    const db = req.app.locals.db;
    await run(db, 'INSERT INTO admin_chat (admin_id, message) VALUES ($1, $2)', [req.session.user.id, req.body.message]);
    res.redirect('/admin/chat');
  }
);

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = router;
