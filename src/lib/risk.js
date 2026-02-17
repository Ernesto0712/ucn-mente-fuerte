// Heurística simple (editable) para clasificar riesgo.
// Nota: Esto NO sustituye evaluación clínica.

const CRITICAL_KEYWORDS = [
  'suicid',
  'matarme',
  'matar',
  'morir',
  'no quiero vivir',
  'autoles',
  'cort',
  'me hice daño',
  'me hago daño'
];

const AT_RISK_KEYWORDS = [
  'depres',
  'ansied',
  'panic',
  'ataque',
  'insom',
  'estres',
  'lloro',
  'triste',
  'vacío',
  'agot',
  'sin energía'
];

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function scoreFromText(text) {
  const t = normalize(text);
  let score = 0;

  for (const k of CRITICAL_KEYWORDS) {
    if (t.includes(k)) score += 8;
  }
  for (const k of AT_RISK_KEYWORDS) {
    if (t.includes(k)) score += 3;
  }

  // señales por intensidad/frecuencia
  if (t.includes('siempre') || t.includes('todos los dias')) score += 2;
  if (t.includes('a menudo') || t.includes('frecuente')) score += 1;

  return score;
}

function classifyRisk(answers) {
  // answers: { q1: '', ... }
  const texts = Object.values(answers || {}).join(' ');
  let score = scoreFromText(texts);

  // Reglas adicionales por respuestas específicas
  const mood = normalize(answers?.q4 || '');
  if (mood.includes('muy mal') || mood.includes('horrible')) score += 3;

  let level = 'normal';
  if (score >= 14) level = 'critical';
  else if (score >= 6) level = 'at_risk';

  return { score, level };
}

module.exports = { classifyRisk };
