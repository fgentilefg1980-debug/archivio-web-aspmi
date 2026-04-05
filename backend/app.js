const express = require('express');
const cors = require('cors');
const { pool, dbConfig } = require('./db');
const {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand
} = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const net = require('net');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
require('dotenv').config();

const app = express();

app.use(express.json());

// =========================
// CONFIG
// =========================

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER ||
  `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`;

const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE || '';
const ADMIN_ROLES = ['admin', 'archivio_admin', 'aspmi_admin'];

const jwks = jwksClient({
  jwksUri: `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxEntries: 10,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

// =========================
// CORS
// =========================

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS non consentito per origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// =========================
// S3
// =========================

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim()
  }
});

const BUCKET = 'apmi-archivio-644209052775-eu-north-1-an';

// =========================
// UTILS
// =========================

function sanitizeFileName(fileName) {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getFileExtension(fileName) {
  if (!fileName || !fileName.includes('.')) return '';
  return fileName.split('.').pop().toLowerCase();
}

function slugifyPathSegment(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function getSigningKey(header, callback) {
  jwks.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

function normalizeRoles(decoded) {
  const realmRoles = decoded?.realm_access?.roles || [];
  const resourceRoles = Object.values(decoded?.resource_access || {}).flatMap(
    (entry) => entry?.roles || []
  );

  return [...new Set([...realmRoles, ...resourceRoles].map((r) => String(r).toLowerCase()))];
}

function isAudienceAllowed(decoded) {
  if (!KEYCLOAK_AUDIENCE) return true;

  const aud = decoded?.aud;
  const azp = decoded?.azp;

  if (Array.isArray(aud) && aud.includes(KEYCLOAK_AUDIENCE)) return true;
  if (typeof aud === 'string' && aud === KEYCLOAK_AUDIENCE) return true;
  if (azp === KEYCLOAK_AUDIENCE) return true;

  return false;
}

function buildErrorResponse(friendlyMessage, err) {
  return {
    error: friendlyMessage,
    details: err?.message || 'Errore sconosciuto',
    code: err?.code || null,
    errno: err?.errno || null,
    sqlState: err?.sqlState || null,
    sqlMessage: err?.sqlMessage || null
  };
}

function getUsernameFromToken(req) {
  return (
    req.user?.preferred_username ||
    req.user?.email ||
    req.user?.sub ||
    null
  );
}

// =========================
// AUTH MIDDLEWARE
// =========================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token mancante o non valido' });
  }

  jwt.verify(
    token,
    getSigningKey,
    {
      algorithms: ['RS256'],
      issuer: KEYCLOAK_ISSUER
    },
    (err, decoded) => {
      if (err) {
        console.error('Errore verifica JWT:', err.message);
        return res.status(401).json({ error: 'Token non valido' });
      }

      if (!isAudienceAllowed(decoded)) {
        return res.status(403).json({ error: 'Audience token non autorizzata' });
      }

      req.user = decoded;
      req.userRoles = normalizeRoles(decoded);
      req.isAdmin = req.userRoles.some((role) => ADMIN_ROLES.includes(role));

      next();
    }
  );
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Operazione consentita solo agli amministratori' });
  }
  next();
}

// =========================
// ROOT
// =========================

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'api',
    versione: 'backend-completo-online'
  });
});

// =========================
// DEBUG PUBBLICO
// =========================

app.get('/api/test-db', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1+1 AS test');
    res.json({ success: true, result: rows[0] });
  } catch (err) {
    console.error('Errore connessione DB:', err);
    res.status(500).json(buildErrorResponse('Errore connessione DB', err));
  }
});

app.get('/api/debug-db', authenticateToken, requireAdmin, async (req, res) => {
  res.json({
    env: {
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_NAME: process.env.DB_NAME,
      DB_USER: process.env.DB_USER,
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY_LENGTH: process.env.AWS_SECRET_ACCESS_KEY
        ? process.env.AWS_SECRET_ACCESS_KEY.trim().length
        : 0
    },
    config: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database
    }
  });
});

app.get('/api/debug-tcp', authenticateToken, requireAdmin, async (req, res) => {
  const host = process.env.DB_HOST;
  const port = Number(req.query.port || process.env.DB_PORT || 3306);

  const socket = new net.Socket();
  let done = false;

  const finish = (status, extra = {}) => {
    if (done) return;
    done = true;
    try {
      socket.destroy();
    } catch (e) {}
    res.json({
      host,
      port,
      status,
      ...extra
    });
  };

  socket.setTimeout(5000);

  socket.on('connect', () => {
    finish('connected', {
      localAddress: socket.localAddress,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort
    });
  });

  socket.on('timeout', () => {
    finish('timeout');
  });

  socket.on('error', (err) => {
    finish('error', {
      code: err.code,
      message: err.message
    });
  });

  socket.connect(port, host);
});

// =========================
// DEBUG S3
// =========================

app.get('/api/debug-s3-headbucket', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const command = new HeadBucketCommand({
      Bucket: BUCKET
    });

    await s3.send(command);

    res.json({
      ok: true,
      message: 'HeadBucket riuscito',
      bucket: BUCKET,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID
    });
  } catch (err) {
    console.error('Errore HeadBucket S3:', err);
    res.status(500).json(buildErrorResponse('Errore HeadBucket S3', err));
  }
});

app.get('/api/debug-s3-putobject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const testKey = `debug/test-${Date.now()}.txt`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: testKey,
      Body: 'test upload backend',
      ContentType: 'text/plain'
    });

    await s3.send(command);

    res.json({
      ok: true,
      message: 'PutObject backend riuscito',
      bucket: BUCKET,
      key: testKey,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID
    });
  } catch (err) {
    console.error('Errore PutObject S3 backend:', err);
    res.status(500).json(buildErrorResponse('Errore PutObject S3 backend', err));
  }
});

// =========================
// STATI
// =========================

app.get('/api/stati', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *
      FROM stati_documento
      ORDER BY nome_stato
    `);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore stati:', err);
    res.status(500).json(buildErrorResponse('Errore stati', err));
  }
});

// =========================
// CARTELLE
// =========================

app.get('/api/cartelle', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *
      FROM cartelle_archivio
      ORDER BY livello, percorso_completo, nome_cartella
    `);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore cartelle:', err);
    res.status(500).json(buildErrorResponse('Errore cartelle', err));
  }
});

app.post('/api/cartelle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      id_cartella_padre,
      nome_cartella,
      descrizione,
      ordine_visualizzazione,
      attiva
    } = req.body;

    const nomePulito = String(nome_cartella || '').trim();

    if (!nomePulito) {
      return res.status(400).json({ error: 'Nome cartella obbligatorio' });
    }

    const [dupRows] = await pool.query(
      `
      SELECT id_cartella
      FROM cartelle_archivio
      WHERE nome_cartella = ?
        AND IFNULL(id_cartella_padre, 0) = IFNULL(?, 0)
      `,
      [nomePulito, id_cartella_padre || null]
    );

    if (dupRows.length) {
      return res.status(400).json({
        error: 'Esiste già una cartella con questo nome sotto la stessa cartella padre'
      });
    }

    let livello = 0;
    let percorso_completo = nomePulito;
    let prefisso_s3 = `${slugifyPathSegment(nomePulito)}/`;

    if (id_cartella_padre) {
      const [parentRows] = await pool.query(
        `
        SELECT
          id_cartella,
          nome_cartella,
          percorso_completo,
          livello,
          prefisso_s3
        FROM cartelle_archivio
        WHERE id_cartella = ?
        `,
        [id_cartella_padre]
      );

      if (!parentRows.length) {
        return res.status(404).json({ error: 'Cartella padre non trovata' });
      }

      const parent = parentRows[0];
      livello = Number(parent.livello || 0) + 1;
      percorso_completo = `${parent.percorso_completo} > ${nomePulito}`;

      const parentPrefix = (parent.prefisso_s3 || `${slugifyPathSegment(parent.nome_cartella)}/`)
        .replace(/^\/+|\/+$/g, '');

      prefisso_s3 = `${parentPrefix}/${slugifyPathSegment(nomePulito)}/`;
    }

    const [result] = await pool.query(
      `
      INSERT INTO cartelle_archivio (
        id_cartella_padre,
        nome_cartella,
        descrizione,
        ordine_visualizzazione,
        attiva,
        prefisso_s3,
        percorso_completo,
        livello
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id_cartella_padre || null,
        nomePulito,
        descrizione || null,
        ordine_visualizzazione ?? 0,
        attiva ?? 1,
        prefisso_s3,
        percorso_completo,
        livello
      ]
    );

    res.status(201).json({
      messaggio: 'Cartella creata con successo',
      id_cartella: result.insertId
    });
  } catch (err) {
    console.error('Errore creazione cartella:', err);
    res.status(500).json(buildErrorResponse('Errore creazione cartella', err));
  }
});

app.put('/api/cartelle/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { nome_cartella, descrizione, ordine_visualizzazione, attiva } = req.body;

    const nomePulito = String(nome_cartella || '').trim();

    if (!nomePulito) {
      return res.status(400).json({ error: 'Nome cartella obbligatorio' });
    }

    const [currentRows] = await pool.query(
      `SELECT * FROM cartelle_archivio WHERE id_cartella = ?`,
      [id]
    );

    if (!currentRows.length) {
      return res.status(404).json({ error: 'Cartella non trovata' });
    }

    const current = currentRows[0];

    const [dupRows] = await pool.query(
      `
      SELECT id_cartella
      FROM cartelle_archivio
      WHERE nome_cartella = ?
        AND IFNULL(id_cartella_padre, 0) = IFNULL(?, 0)
        AND id_cartella <> ?
      `,
      [nomePulito, current.id_cartella_padre || null, id]
    );

    if (dupRows.length) {
      return res.status(400).json({
        error: 'Esiste già una cartella con questo nome sotto la stessa cartella padre'
      });
    }

    let percorso_completo = nomePulito;
    let prefisso_s3 = `${slugifyPathSegment(nomePulito)}/`;

    if (current.id_cartella_padre) {
      const [parentRows] = await pool.query(
        `SELECT * FROM cartelle_archivio WHERE id_cartella = ?`,
        [current.id_cartella_padre]
      );

      if (parentRows.length) {
        const parent = parentRows[0];
        percorso_completo = `${parent.percorso_completo} > ${nomePulito}`;

        const parentPrefix = (parent.prefisso_s3 || `${slugifyPathSegment(parent.nome_cartella)}/`)
          .replace(/^\/+|\/+$/g, '');

        prefisso_s3 = `${parentPrefix}/${slugifyPathSegment(nomePulito)}/`;
      }
    }

    await pool.query(
      `
      UPDATE cartelle_archivio
      SET
        nome_cartella = ?,
        descrizione = ?,
        ordine_visualizzazione = ?,
        attiva = ?,
        prefisso_s3 = ?,
        percorso_completo = ?
      WHERE id_cartella = ?
      `,
      [
        nomePulito,
        descrizione || null,
        ordine_visualizzazione ?? 0,
        attiva ?? 1,
        prefisso_s3,
        percorso_completo,
        id
      ]
    );

    res.json({ messaggio: 'Cartella aggiornata con successo' });
  } catch (err) {
    console.error('Errore modifica cartella:', err);
    res.status(500).json(buildErrorResponse('Errore modifica cartella', err));
  }
});

app.delete('/api/cartelle/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const [childRows] = await pool.query(
      `SELECT id_cartella FROM cartelle_archivio WHERE id_cartella_padre = ?`,
      [id]
    );

    if (childRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questa cartella perché contiene sottocartelle'
      });
    }

    const [docRows] = await pool.query(
      `SELECT id_documento FROM documenti WHERE id_cartella = ?`,
      [id]
    );

    if (docRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questa cartella perché ci sono documenti collegati'
      });
    }

    const [result] = await pool.query(
      `DELETE FROM cartelle_archivio WHERE id_cartella = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Cartella non trovata' });
    }

    res.json({ messaggio: 'Cartella eliminata con successo' });
  } catch (err) {
    console.error('Errore eliminazione cartella:', err);
    res.status(500).json(buildErrorResponse('Errore eliminazione cartella', err));
  }
});

// =========================
// ENTI / SOTTOENTI / UFFICI
// =========================

app.get('/api/enti', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id_ente, ENTE
      FROM enti
      ORDER BY ENTE
    `);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore enti:', err);
    res.status(500).json(buildErrorResponse('Errore enti', err));
  }
});

app.post('/api/enti', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nome = String(req.body.ENTE || '').trim();

    if (!nome) {
      return res.status(400).json({ error: 'Nome ente obbligatorio' });
    }

    const [dupRows] = await pool.query(
      `SELECT id_ente FROM enti WHERE ENTE = ?`,
      [nome]
    );

    if (dupRows.length) {
      return res.status(400).json({ error: 'Esiste già un ente con questo nome' });
    }

    const [result] = await pool.query(
      `INSERT INTO enti (ENTE) VALUES (?)`,
      [nome]
    );

    res.status(201).json({
      messaggio: 'Ente creato con successo',
      id_ente: result.insertId
    });
  } catch (err) {
    console.error('Errore creazione ente:', err);
    res.status(500).json(buildErrorResponse('Errore creazione ente', err));
  }
});

app.put('/api/enti/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const nome = String(req.body.ENTE || '').trim();

    if (!nome) {
      return res.status(400).json({ error: 'Nome ente obbligatorio' });
    }

    const [dupRows] = await pool.query(
      `SELECT id_ente FROM enti WHERE ENTE = ? AND id_ente <> ?`,
      [nome, id]
    );

    if (dupRows.length) {
      return res.status(400).json({ error: 'Esiste già un ente con questo nome' });
    }

    const [result] = await pool.query(
      `UPDATE enti SET ENTE = ? WHERE id_ente = ?`,
      [nome, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Ente non trovato' });
    }

    res.json({ messaggio: 'Ente aggiornato con successo' });
  } catch (err) {
    console.error('Errore modifica ente:', err);
    res.status(500).json(buildErrorResponse('Errore modifica ente', err));
  }
});

app.delete('/api/enti/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const [sottoentiRows] = await pool.query(
      `SELECT id_sottoente FROM sottoenti WHERE id_ente = ?`,
      [id]
    );

    if (sottoentiRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questo ente perché ha sottoenti collegati'
      });
    }

    const [docRows] = await pool.query(
      `SELECT id_documento FROM documenti WHERE id_ente = ?`,
      [id]
    );

    if (docRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questo ente perché ci sono documenti collegati'
      });
    }

    const [result] = await pool.query(
      `DELETE FROM enti WHERE id_ente = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Ente non trovato' });
    }

    res.json({ messaggio: 'Ente eliminato con successo' });
  } catch (err) {
    console.error('Errore eliminazione ente:', err);
    res.status(500).json(buildErrorResponse('Errore eliminazione ente', err));
  }
});

app.get('/api/sottoenti', authenticateToken, async (req, res) => {
  try {
    const { id_ente } = req.query;

    let query = `
      SELECT
        s.id_sottoente,
        s.id_ente,
        s.nome_sottoente,
        s.descrizione,
        e.ENTE AS nome_ente
      FROM sottoenti s
      LEFT JOIN enti e ON s.id_ente = e.id_ente
    `;
    const params = [];

    if (id_ente) {
      query += ` WHERE s.id_ente = ?`;
      params.push(id_ente);
    }

    query += ` ORDER BY s.nome_sottoente`;

    const [rows] = await pool.query(query, params);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore sottoenti:', err);
    res.status(500).json(buildErrorResponse('Errore sottoenti', err));
  }
});

app.post('/api/sottoenti', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id_ente, nome_sottoente, descrizione } = req.body;
    const nomePulito = String(nome_sottoente || '').trim();

    if (!id_ente) {
      return res.status(400).json({ error: 'Seleziona un ente' });
    }

    if (!nomePulito) {
      return res.status(400).json({ error: 'Nome sottoente obbligatorio' });
    }

    const [enteRows] = await pool.query(
      `SELECT id_ente FROM enti WHERE id_ente = ?`,
      [id_ente]
    );

    if (!enteRows.length) {
      return res.status(404).json({ error: 'Ente non trovato' });
    }

    const [dupRows] = await pool.query(
      `
      SELECT id_sottoente
      FROM sottoenti
      WHERE id_ente = ?
        AND nome_sottoente = ?
      `,
      [id_ente, nomePulito]
    );

    if (dupRows.length) {
      return res.status(400).json({
        error: 'Esiste già un sottoente con questo nome per l’ente selezionato'
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO sottoenti (id_ente, nome_sottoente, descrizione, attivo)
      VALUES (?, ?, ?, 1)
      `,
      [id_ente, nomePulito, descrizione || null]
    );

    res.status(201).json({
      messaggio: 'Sottoente creato con successo',
      id_sottoente: result.insertId
    });
  } catch (err) {
    console.error('Errore creazione sottoente:', err);
    res.status(500).json(buildErrorResponse('Errore creazione sottoente', err));
  }
});

app.put('/api/sottoenti/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { id_ente, nome_sottoente, descrizione } = req.body;
    const nomePulito = String(nome_sottoente || '').trim();

    if (!id_ente) {
      return res.status(400).json({ error: 'Seleziona un ente' });
    }

    if (!nomePulito) {
      return res.status(400).json({ error: 'Nome sottoente obbligatorio' });
    }

    const [dupRows] = await pool.query(
      `
      SELECT id_sottoente
      FROM sottoenti
      WHERE id_ente = ?
        AND nome_sottoente = ?
        AND id_sottoente <> ?
      `,
      [id_ente, nomePulito, id]
    );

    if (dupRows.length) {
      return res.status(400).json({
        error: 'Esiste già un sottoente con questo nome per l’ente selezionato'
      });
    }

    const [result] = await pool.query(
      `
      UPDATE sottoenti
      SET id_ente = ?, nome_sottoente = ?, descrizione = ?
      WHERE id_sottoente = ?
      `,
      [id_ente, nomePulito, descrizione || null, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Sottoente non trovato' });
    }

    res.json({ messaggio: 'Sottoente aggiornato con successo' });
  } catch (err) {
    console.error('Errore modifica sottoente:', err);
    res.status(500).json(buildErrorResponse('Errore modifica sottoente', err));
  }
});

app.delete('/api/sottoenti/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const [ufficiRows] = await pool.query(
      `SELECT id_ufficio FROM uffici WHERE id_sottoente = ?`,
      [id]
    );

    if (ufficiRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questo sottoente perché ha uffici collegati'
      });
    }

    const [docRows] = await pool.query(
      `SELECT id_documento FROM documenti WHERE id_sottoente = ?`,
      [id]
    );

    if (docRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questo sottoente perché ci sono documenti collegati'
      });
    }

    const [result] = await pool.query(
      `DELETE FROM sottoenti WHERE id_sottoente = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Sottoente non trovato' });
    }

    res.json({ messaggio: 'Sottoente eliminato con successo' });
  } catch (err) {
    console.error('Errore eliminazione sottoente:', err);
    res.status(500).json(buildErrorResponse('Errore eliminazione sottoente', err));
  }
});

app.get('/api/uffici', authenticateToken, async (req, res) => {
  try {
    const { id_sottoente } = req.query;

    let query = `
      SELECT
        u.id_ufficio,
        u.id_sottoente,
        u.nome_ufficio,
        u.descrizione,
        s.nome_sottoente,
        e.ENTE AS nome_ente
      FROM uffici u
      LEFT JOIN sottoenti s ON u.id_sottoente = s.id_sottoente
      LEFT JOIN enti e ON s.id_ente = e.id_ente
    `;
    const params = [];

    if (id_sottoente) {
      query += ` WHERE u.id_sottoente = ?`;
      params.push(id_sottoente);
    }

    query += ` ORDER BY u.nome_ufficio`;

    const [rows] = await pool.query(query, params);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore uffici:', err);
    res.status(500).json(buildErrorResponse('Errore uffici', err));
  }
});

app.post('/api/uffici', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id_sottoente, nome_ufficio, descrizione } = req.body;
    const nomePulito = String(nome_ufficio || '').trim();

    if (!id_sottoente) {
      return res.status(400).json({ error: 'Seleziona un sottoente' });
    }

    if (!nomePulito) {
      return res.status(400).json({ error: 'Nome ufficio obbligatorio' });
    }

    const [sottoenteRows] = await pool.query(
      `SELECT id_sottoente FROM sottoenti WHERE id_sottoente = ?`,
      [id_sottoente]
    );

    if (!sottoenteRows.length) {
      return res.status(404).json({ error: 'Sottoente non trovato' });
    }

    const [dupRows] = await pool.query(
      `
      SELECT id_ufficio
      FROM uffici
      WHERE id_sottoente = ?
        AND nome_ufficio = ?
      `,
      [id_sottoente, nomePulito]
    );

    if (dupRows.length) {
      return res.status(400).json({
        error: 'Esiste già un ufficio con questo nome per il sottoente selezionato'
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO uffici (id_sottoente, nome_ufficio, descrizione, attivo)
      VALUES (?, ?, ?, 1)
      `,
      [id_sottoente, nomePulito, descrizione || null]
    );

    res.status(201).json({
      messaggio: 'Ufficio creato con successo',
      id_ufficio: result.insertId
    });
  } catch (err) {
    console.error('Errore creazione ufficio:', err);
    res.status(500).json(buildErrorResponse('Errore creazione ufficio', err));
  }
});

app.put('/api/uffici/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { id_sottoente, nome_ufficio, descrizione } = req.body;
    const nomePulito = String(nome_ufficio || '').trim();

    if (!id_sottoente) {
      return res.status(400).json({ error: 'Seleziona un sottoente' });
    }

    if (!nomePulito) {
      return res.status(400).json({ error: 'Nome ufficio obbligatorio' });
    }

    const [dupRows] = await pool.query(
      `
      SELECT id_ufficio
      FROM uffici
      WHERE id_sottoente = ?
        AND nome_ufficio = ?
        AND id_ufficio <> ?
      `,
      [id_sottoente, nomePulito, id]
    );

    if (dupRows.length) {
      return res.status(400).json({
        error: 'Esiste già un ufficio con questo nome per il sottoente selezionato'
      });
    }

    const [result] = await pool.query(
      `
      UPDATE uffici
      SET id_sottoente = ?, nome_ufficio = ?, descrizione = ?
      WHERE id_ufficio = ?
      `,
      [id_sottoente, nomePulito, descrizione || null, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Ufficio non trovato' });
    }

    res.json({ messaggio: 'Ufficio aggiornato con successo' });
  } catch (err) {
    console.error('Errore modifica ufficio:', err);
    res.status(500).json(buildErrorResponse('Errore modifica ufficio', err));
  }
});

app.delete('/api/uffici/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const [docRows] = await pool.query(
      `SELECT id_documento FROM documenti WHERE id_ufficio = ?`,
      [id]
    );

    if (docRows.length) {
      return res.status(400).json({
        error: 'Non puoi eliminare questo ufficio perché ci sono documenti collegati'
      });
    }

    const [result] = await pool.query(
      `DELETE FROM uffici WHERE id_ufficio = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Ufficio non trovato' });
    }

    res.json({ messaggio: 'Ufficio eliminato con successo' });
  } catch (err) {
    console.error('Errore eliminazione ufficio:', err);
    res.status(500).json(buildErrorResponse('Errore eliminazione ufficio', err));
  }
});

// =========================
// DOCUMENTI RECENTI
// =========================

app.get('/api/documenti/recenti', authenticateToken, async (req, res) => {
  try {
    const username = getUsernameFromToken(req);

    if (!username) {
      return res.status(401).json({ error: 'Utente non autenticato' });
    }

    const [rows] = await pool.query(
      `
      SELECT
        d.id_documento,
        d.protocollo,
        d.data_pubblicazione,
        d.oggetto,
        d.nome_file_originale,
        c.nome_cartella,
        c.percorso_completo,
        s.nome_stato,
        r.data_ultima_visita
      FROM documenti_recenti_utente r
      INNER JOIN documenti d ON d.id_documento = r.id_documento
      LEFT JOIN cartelle_archivio c ON c.id_cartella = d.id_cartella
      LEFT JOIN stati_documento s ON s.id_stato = d.id_stato
      WHERE r.username = ?
      ORDER BY r.data_ultima_visita DESC
      LIMIT 8
      `,
      [username]
    );

    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore recupero documenti recenti:', err);
    res.status(500).json(buildErrorResponse('Errore recupero documenti recenti', err));
  }
});

app.post('/api/documenti/recenti/:idDocumento', authenticateToken, async (req, res) => {
  try {
    const username = getUsernameFromToken(req);
    const idDocumento = Number(req.params.idDocumento);

    if (!username) {
      return res.status(401).json({ error: 'Utente non autenticato' });
    }

    if (!idDocumento || Number.isNaN(idDocumento)) {
      return res.status(400).json({ error: 'ID documento non valido' });
    }

    const [checkRows] = await pool.query(
      `
      SELECT id_documento
      FROM documenti
      WHERE id_documento = ?
      LIMIT 1
      `,
      [idDocumento]
    );

    if (!checkRows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    await pool.query(
      `
      INSERT INTO documenti_recenti_utente (username, id_documento, data_ultima_visita)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        data_ultima_visita = NOW()
      `,
      [username, idDocumento]
    );

    await pool.query(
      `
      DELETE FROM documenti_recenti_utente
      WHERE username = ?
        AND id_recente NOT IN (
          SELECT id_recente_keep
          FROM (
            SELECT id_recente AS id_recente_keep
            FROM documenti_recenti_utente
            WHERE username = ?
            ORDER BY data_ultima_visita DESC
            LIMIT 8
          ) t
        )
      `,
      [username, username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Errore salvataggio documento recente:', err);
    res.status(500).json(buildErrorResponse('Errore salvataggio documento recente', err));
  }
});

app.delete('/api/documenti/recenti', authenticateToken, async (req, res) => {
  try {
    const username = getUsernameFromToken(req);

    if (!username) {
      return res.status(401).json({ error: 'Utente non autenticato' });
    }

    await pool.query(
      `DELETE FROM documenti_recenti_utente WHERE username = ?`,
      [username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Errore cancellazione documenti recenti:', err);
    res.status(500).json(buildErrorResponse('Errore cancellazione documenti recenti', err));
  }
});

// =========================
// DOCUMENTI
// =========================

app.post('/api/documenti/presigned-upload', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { fileName, id_cartella, contentType } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'Nome file mancante' });
    }

    let prefix = 'documenti';

    if (id_cartella) {
      const [rows] = await pool.query(
        `SELECT prefisso_s3, nome_cartella FROM cartelle_archivio WHERE id_cartella = ?`,
        [id_cartella]
      );

      if (rows.length && rows[0].prefisso_s3) {
        prefix = rows[0].prefisso_s3.replace(/^\/+|\/+$/g, '');
      }
    }

    const safeFileName = sanitizeFileName(fileName);
    const uniqueToken = crypto.randomBytes(8).toString('hex');
    const s3Key = `${prefix}/${Date.now()}-${uniqueToken}-${safeFileName}`;
    const mimeType = contentType || 'application/octet-stream';

    const presignedPost = await createPresignedPost(s3, {
      Bucket: BUCKET,
      Key: s3Key,
      Expires: 300,
      Fields: {
        key: s3Key,
        'Content-Type': mimeType
      },
      Conditions: [
        ['eq', '$key', s3Key],
        ['eq', '$Content-Type', mimeType],
        ['content-length-range', 1, 104857600]
      ]
    });

    res.json({
      uploadUrl: presignedPost.url,
      fields: presignedPost.fields,
      bucket: BUCKET,
      key: s3Key,
      nome_file: s3Key.split('/').pop(),
      nome_file_originale: fileName,
      estensione_file: getFileExtension(fileName),
      contentType: mimeType
    });
  } catch (err) {
    console.error('Errore generazione presigned upload:', err);
    res.status(500).json(buildErrorResponse('Errore generazione upload URL', err));
  }
});

app.post('/api/documenti', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      id_ente,
      id_sottoente,
      id_ufficio,
      id_cartella,
      id_stato,
      protocollo,
      data_pubblicazione,
      oggetto,
      descrizione_breve,
      note,
      nome_file,
      percorso_file,
      estensione_file,
      bucket_s3,
      chiave_s3,
      nome_file_originale
    } = req.body;

    if (!id_cartella || !id_stato || !data_pubblicazione || !oggetto) {
      return res.status(400).json({
        error: 'Compila i campi obbligatori: cartella, stato, data pubblicazione, oggetto'
      });
    }

    const query = `
      INSERT INTO documenti (
        id_ente,
        id_sottoente,
        id_ufficio,
        id_cartella,
        id_stato,
        protocollo,
        data_pubblicazione,
        oggetto,
        descrizione_breve,
        note,
        nome_file,
        percorso_file,
        estensione_file,
        attivo,
        bucket_s3,
        chiave_s3,
        nome_file_originale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `;

    const params = [
      id_ente || null,
      id_sottoente || null,
      id_ufficio || null,
      id_cartella,
      id_stato,
      protocollo || null,
      data_pubblicazione,
      oggetto,
      descrizione_breve || null,
      note || null,
      nome_file || null,
      percorso_file || null,
      estensione_file || null,
      bucket_s3 || null,
      chiave_s3 || null,
      nome_file_originale || null
    ];

    const [result] = await pool.query(query, params);

    res.status(201).json({
      messaggio: 'Documento inserito con successo',
      id_documento: result.insertId
    });
  } catch (err) {
    console.error('Errore inserimento documento:', err);
    res.status(500).json(buildErrorResponse('Errore inserimento documento', err));
  }
});

app.put('/api/documenti/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const idDocumento = req.params.id;

    const {
      id_ente,
      id_sottoente,
      id_ufficio,
      id_cartella,
      id_stato,
      protocollo,
      data_pubblicazione,
      oggetto,
      descrizione_breve,
      note,
      nome_file,
      percorso_file,
      estensione_file,
      bucket_s3,
      chiave_s3,
      nome_file_originale,
      elimina_vecchio_allegato
    } = req.body;

    if (!id_cartella || !id_stato || !data_pubblicazione || !oggetto) {
      return res.status(400).json({
        error: 'Compila i campi obbligatori: cartella, stato, data pubblicazione, oggetto'
      });
    }

    const [checkRows] = await pool.query(
      `
      SELECT
        id_documento,
        chiave_s3,
        bucket_s3,
        nome_file
      FROM documenti
      WHERE id_documento = ?
      `,
      [idDocumento]
    );

    if (!checkRows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    const documentoAttuale = checkRows[0];

    if (elimina_vecchio_allegato && (documentoAttuale.chiave_s3 || documentoAttuale.nome_file)) {
      const vecchioBucket = documentoAttuale.bucket_s3 || BUCKET;
      const vecchiaChiave = documentoAttuale.chiave_s3 || documentoAttuale.nome_file;

      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: vecchioBucket,
          Key: vecchiaChiave
        });

        await s3.send(deleteCommand);
      } catch (s3Error) {
        console.error('Errore cancellazione vecchio allegato S3:', s3Error);
        return res.status(500).json(buildErrorResponse('Errore cancellazione vecchio allegato S3', s3Error));
      }
    }

    let query = `
      UPDATE documenti
      SET
        id_ente = ?,
        id_sottoente = ?,
        id_ufficio = ?,
        id_cartella = ?,
        id_stato = ?,
        protocollo = ?,
        data_pubblicazione = ?,
        oggetto = ?,
        descrizione_breve = ?,
        note = ?
    `;

    const params = [
      id_ente || null,
      id_sottoente || null,
      id_ufficio || null,
      id_cartella,
      id_stato,
      protocollo || null,
      data_pubblicazione,
      oggetto,
      descrizione_breve || null,
      note || null
    ];

    if (nome_file !== undefined) {
      query += `,
        nome_file = ?,
        percorso_file = ?,
        estensione_file = ?,
        bucket_s3 = ?,
        chiave_s3 = ?,
        nome_file_originale = ?
      `;

      params.push(
        nome_file || null,
        percorso_file || null,
        estensione_file || null,
        bucket_s3 || null,
        chiave_s3 || null,
        nome_file_originale || null
      );
    }

    query += ` WHERE id_documento = ?`;
    params.push(idDocumento);

    await pool.query(query, params);

    res.json({
      messaggio: 'Documento aggiornato con successo',
      id_documento: idDocumento
    });
  } catch (err) {
    console.error('Errore modifica documento:', err);
    res.status(500).json(buildErrorResponse('Errore modifica documento', err));
  }
});

app.get('/api/documenti/ricerca', authenticateToken, async (req, res) => {
  try {
    const {
      testo,
      id_cartella,
      id_stato,
      id_ente,
      id_sottoente,
      id_ufficio
    } = req.query;

    let query = `
      SELECT
        d.*,
        c.nome_cartella,
        c.percorso_completo,
        s.nome_stato,
        e.ENTE AS nome_ente,
        se.nome_sottoente,
        u.nome_ufficio
      FROM documenti d
      LEFT JOIN cartelle_archivio c ON d.id_cartella = c.id_cartella
      LEFT JOIN stati_documento s ON d.id_stato = s.id_stato
      LEFT JOIN enti e ON d.id_ente = e.id_ente
      LEFT JOIN sottoenti se ON d.id_sottoente = se.id_sottoente
      LEFT JOIN uffici u ON d.id_ufficio = u.id_ufficio
      WHERE 1=1
    `;

    const params = [];

    if (testo) {
      query += `
        AND (
          d.oggetto LIKE ?
          OR d.descrizione_breve LIKE ?
          OR d.protocollo LIKE ?
        )
      `;
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

    if (id_ente) {
      query += ` AND d.id_ente = ?`;
      params.push(id_ente);
    }

    if (id_sottoente) {
      query += ` AND d.id_sottoente = ?`;
      params.push(id_sottoente);
    }

    if (id_ufficio) {
      query += ` AND d.id_ufficio = ?`;
      params.push(id_ufficio);
    }

    query += ` ORDER BY d.data_pubblicazione DESC, d.id_documento DESC`;

    const [rows] = await pool.query(query, params);
    res.json({ dati: rows });
  } catch (err) {
    console.error('Errore ricerca:', err);
    res.status(500).json(buildErrorResponse('Errore ricerca', err));
  }
});

app.get('/api/documenti/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        d.*,
        c.nome_cartella,
        c.percorso_completo,
        s.nome_stato,
        e.ENTE AS nome_ente,
        se.nome_sottoente,
        u.nome_ufficio
      FROM documenti d
      LEFT JOIN cartelle_archivio c ON d.id_cartella = c.id_cartella
      LEFT JOIN stati_documento s ON d.id_stato = s.id_stato
      LEFT JOIN enti e ON d.id_ente = e.id_ente
      LEFT JOIN sottoenti se ON d.id_sottoente = se.id_sottoente
      LEFT JOIN uffici u ON d.id_ufficio = u.id_ufficio
      WHERE d.id_documento = ?
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    res.json({ dato: rows[0] });
  } catch (err) {
    console.error('Errore dettaglio:', err);
    res.status(500).json(buildErrorResponse('Errore dettaglio', err));
  }
});

app.delete('/api/documenti/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const idDocumento = req.params.id;

    const [rows] = await pool.query(
      `
      SELECT
        id_documento,
        chiave_s3,
        bucket_s3,
        nome_file
      FROM documenti
      WHERE id_documento = ?
      `,
      [idDocumento]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    const documento = rows[0];
    const bucket = documento.bucket_s3 || BUCKET;
    const fileKey = documento.chiave_s3 || documento.nome_file;

    if (fileKey) {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileKey
        });

        await s3.send(deleteCommand);
      } catch (s3Error) {
        console.error('Errore cancellazione file S3:', s3Error);
        return res.status(500).json(buildErrorResponse('Errore cancellazione allegato S3', s3Error));
      }
    }

    await pool.query(
      `DELETE FROM documenti WHERE id_documento = ?`,
      [idDocumento]
    );

    res.json({
      messaggio: 'Documento eliminato con successo'
    });
  } catch (err) {
    console.error('Errore eliminazione documento:', err);
    res.status(500).json(buildErrorResponse('Errore eliminazione documento', err));
  }
});

app.get('/api/documenti/:id/download', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        chiave_s3,
        bucket_s3,
        nome_file_originale,
        nome_file
      FROM documenti
      WHERE id_documento = ?
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }

    const fileKey = rows[0].chiave_s3 || rows[0].nome_file;
    const bucket = rows[0].bucket_s3 || BUCKET;
    const fileName = rows[0].nome_file_originale || 'documento.pdf';

    if (!fileKey) {
      return res.status(404).json({ error: 'Chiave S3 non trovata' });
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ResponseContentDisposition: `attachment; filename="${fileName}"`
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.json({
      download_url: url
    });
  } catch (err) {
    console.error('Errore download:', err);
    res.status(500).json(buildErrorResponse('Errore download', err));
  }
});

// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`API attive su porta ${PORT}`);
  console.log('DB CONFIG ATTIVA:', dbConfig);
  console.log('Origin consentite CORS:', allowedOrigins);
  console.log('Issuer Keycloak:', KEYCLOAK_ISSUER);
  console.log('Audience attesa:', KEYCLOAK_AUDIENCE || '(non impostata)');
  console.log('AWS_REGION:', process.env.AWS_REGION);
  console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID);
  console.log(
    'AWS_SECRET_ACCESS_KEY length:',
    process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY.trim().length : 0
  );
  console.log('Current working dir:', process.cwd());
  console.log(
    'Secret first 4 chars:',
    process.env.AWS_SECRET_ACCESS_KEY
      ? process.env.AWS_SECRET_ACCESS_KEY.trim().slice(0, 4)
      : 'N/D'
  );
  console.log(
    'Secret last 4 chars:',
    process.env.AWS_SECRET_ACCESS_KEY
      ? process.env.AWS_SECRET_ACCESS_KEY.trim().slice(-4)
      : 'N/D'
  );
});