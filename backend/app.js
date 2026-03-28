const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const pool = require('./db');
const { generaPresignedDownloadUrl } = require('./s3');

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER;
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE;

// Creazione del JWKS (JSON Web Key Set) per la validazione del token
const jwks = createRemoteJWKSet(
  new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
);

app.use(cors());
app.use(express.json());

// Servire i file del frontend (vite build)
app.use(express.static(path.join(__dirname, 'public')));

// Funzione per estrarre il token Bearer dalla richiesta
function estraiBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer') return null;

  return token;
}

// Middleware di verifica del token JWT
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

    // Verifica che il client ID sia valido
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

    // Risposta in caso di errore (token non valido o scaduto)
    return res.status(401).json({
      ok: false,
      message: 'Token non valido o scaduto'
    });
  }
}

/* =========================
   API ENDPOINTS
========================= */

// Endpoint di salute del server (health check)
app.get('/api/health', async (req, res) => {
  try {
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Errore interno' });
  }
});

// Endpoint per ottenere i dettagli dell'utente autenticato
app.get('/api/me', verificaToken, (req, res) => {
  res.json({
    ok: true,
    user: req.auth
  });
});

// Endpoint per ottenere le cartelle archivio
app.get('/api/cartelle', verificaToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id_cartella, nome_cartella
      FROM cartelle_archivio
      ORDER BY nome_cartella ASC
    `);

    res.json({ ok: true, dati: rows });
  } catch (error) {
    console.error('Errore lettura cartelle:', error.message);
    res.status(500).json({ ok: false, message: 'Errore nel recupero cartelle' });
  }
});

// Endpoint per ottenere gli stati dei documenti
app.get('/api/stati', verificaToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id_stato, nome_stato
      FROM stati_documento
      ORDER BY nome_stato ASC
    `);

    res.json({ ok: true, dati: rows });
  } catch (error) {
    console.error('Errore lettura stati:', error.message);
    res.status(500).json({ ok: false, message: 'Errore nel recupero stati' });
  }
});

// Endpoint per la ricerca dei documenti
app.get('/api/documenti/ricerca', verificaToken, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Errore ricerca documenti:', error.message);
    res.status(500).json({ ok: false, message: 'Errore durante la ricerca dei documenti' });
  }
});

// Endpoint per il download dei documenti
app.get('/api/documenti/:id/download', verificaToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM documenti WHERE id_documento = ?`,
      [req.params.id]
    );

    const doc = rows[0];

    if (!doc) {
      return res.status(404).json({ ok: false, message: 'Documento non trovato' });
    }

    const url = await generaPresignedDownloadUrl(
      doc.bucket_s3,
      doc.chiave_s3,
      doc.nome_file_originale
    );

    res.json({ ok: true, download_url: url });
  } catch (error) {
    console.error('Errore download documento:', error.message);
    res.status(500).json({ ok: false, message: 'Errore nella generazione del link di download' });
  }
});

/* =========================
   FALLBACK PER SPA
========================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =========================
   AVVIO DEL SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});