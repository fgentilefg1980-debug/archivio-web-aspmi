const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const app = express();

app.use(express.json());

// =======================
// CORS
// =======================
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // consente anche richieste senza origin (test server-to-server, curl, healthcheck)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS non consentito per origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

// =======================
// S3 CONFIG
// =======================
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET = 'apmi-archivio-644209052775-eu-north-1-an';

// =======================
// TEST DB
// =======================
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1+1 AS test');
    res.json({ success: true, result: rows[0] });
  } catch (err) {
    console.error('Errore connessione DB:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// CARTELLE
// =======================
app.get('/api/cartelle', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cartelle_archivio');
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore cartelle:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// STATI
// =======================
app.get('/api/stati', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stati_documento');
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore stati:', err);
    res.status(500).json({ error: 'Errore stati' });
  }
});

// =======================
// RICERCA DOCUMENTI
// =======================
app.get('/api/documenti/ricerca', async (req, res) => {
  try {
    const { testo, id_cartella, id_stato } = req.query;

    let query = `
      SELECT d.*, c.nome_cartella, s.nome_stato
      FROM documenti d
      LEFT JOIN cartelle_archivio c ON d.id_cartella = c.id_cartella
      LEFT JOIN stati_documento s ON d.id_stato = s.id_stato
      WHERE 1=1
    `;

    const params = [];

    if (testo) {
      query += ` AND (d.oggetto LIKE ? OR d.descrizione_breve LIKE ? OR d.protocollo LIKE ?)`;
      params.push(`%${testo}%`, `%${testo}%`, `%${testo}%`);
    }

    if (id_cartella) {
      query += ` AND d.id_cartella = ?`;
      params.push(id_cartella);
    }

    if (id_stato) {
      query += ` AND d.id_stato = ?`;
      params.push(id_stato);
    }

    const [rows] = await pool.query(query, params);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore ricerca:', err);
    res.status(500).json({ error: 'Errore ricerca' });
  }
});

// =======================
// DETTAGLIO DOCUMENTO
// =======================
app.get('/api/documenti/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, c.nome_cartella, s.nome_stato
       FROM documenti d
       LEFT JOIN cartelle_archivio c ON d.id_cartella = c.id_cartella
       LEFT JOIN stati_documento s ON d.id_stato = s.id_stato
       WHERE d.id_documento = ?`,
      [req.params.id]
    );

    res.json({ dato: rows[0] });
  } catch (err) {
    console.error('Errore dettaglio:', err);
    res.status(500).json({ error: 'Errore dettaglio' });
  }
});

// =======================
// DOWNLOAD DOCUMENTO
// =======================
app.get('/api/documenti/:id/download', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT nome_file FROM documenti WHERE id_documento = ?',
      [req.params.id]
    );

    const fileKey = rows[0]?.nome_file;

    if (!fileKey) {
      return res.status(404).json({ error: 'File non trovato' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: fileKey
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ download_url: url });
  } catch (err) {
    console.error('Errore download:', err);
    res.status(500).json({ error: 'Errore download' });
  }
});

// =======================
// FRONTEND STATICO
// =======================
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback: solo per route NON /api
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API attive su porta ${PORT}`);
});