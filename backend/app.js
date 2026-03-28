const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { createRemoteJWKSet, jwtVerify } = require('jose');

dotenv.config();

const pool = require('./db');
const { generaPresignedDownloadUrl } = require('./s3');

const app = express();

const PORT = process.env.PORT || 3001;
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER;
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE;

const jwks = createRemoteJWKSet(
  new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
);

app.use(cors());
app.use(express.json());

/* =========================
   SERVE FRONTEND (VITE BUILD)
========================= */
app.use(express.static(path.join(__dirname, 'public')));

/* =========================
   AUTH MIDDLEWARE
========================= */
function estraiBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer') return null;

  return token;
}

async function verificaToken(req, res, next) {
  try {
    const token = estraiBearerToken(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: 'Token Bearer mancante'
      });
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: KEYCLOAK_ISSUER
    });

    if (payload.azp !== KEYCLOAK_AUDIENCE) {
      return res.status(401).json({
        ok: false,
        message: 'Token non valido per questo client'
      });
    }

    req.auth = payload;
    next();
  } catch (error) {
    console.error('Errore verifica token:', error.message);

    return res.status(401).json({
      ok: false,
      message: 'Token non valido o scaduto'
    });
  }
}

/* =========================
   API
========================= */

app.get('/api/health', async (req, res) => {
  res.json({ ok: true });
});

app.get('/api/me', verificaToken, (req, res) => {
  res.json({
    ok: true,
    user: req.auth
  });
});

app.get('/api/cartelle', verificaToken, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT id_cartella, nome_cartella
    FROM cartelle_archivio
    ORDER BY nome_cartella ASC
  `);

  res.json({ ok: true, dati: rows });
});

app.get('/api/stati', verificaToken, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT id_stato, nome_stato
    FROM stati_documento
    ORDER BY nome_stato ASC
  `);

  res.json({ ok: true, dati: rows });
});

app.get('/api/documenti/ricerca', verificaToken, async (req, res) => {
  const testo = (req.query.testo || '').trim();

  let sql = `
    SELECT d.*, c.nome_cartella, s.nome_stato
    FROM documenti d
    LEFT JOIN cartelle_archivio c ON d.id_cartella = c.id_cartella
    LEFT JOIN stati_documento s ON d.id_stato = s.id_stato
    WHERE 1=1
  `;

  const params = [];

  if (testo !== '') {
    sql += ` AND d.oggetto LIKE ?`;
    params.push(`%${testo}%`);
  }

  sql += ` ORDER BY d.data_pubblicazione DESC LIMIT 200`;

  const [rows] = await pool.query(sql, params);

  res.json({ ok: true, dati: rows });
});

app.get('/api/documenti/:id/download', verificaToken, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM documenti WHERE id_documento = ?`,
    [req.params.id]
  );

  const doc = rows[0];

  const url = await generaPresignedDownloadUrl(
    doc.bucket_s3,
    doc.chiave_s3,
    doc.nome_file_originale
  );

  res.json({ ok: true, download_url: url });
});

/* =========================
   SPA FALLBACK (IMPORTANTISSIMO)
========================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
