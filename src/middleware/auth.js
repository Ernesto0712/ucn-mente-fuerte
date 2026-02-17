function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'warning', message: 'Inicia sesión para continuar.' };
    return res.redirect('/auth/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.session.flash = { type: 'warning', message: 'Inicia sesión para continuar.' };
      return res.redirect('/auth/login');
    }
    if (req.session.user.role !== role) {
      return res.status(403).render('pages/403', { title: 'Acceso denegado' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
