const nodemailer = require("nodemailer");
const { pool } = require("./db");

const smtpPort = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function verificaConfigurazioneEmail() {
  try {
    await transporter.verify();
    return {
      ok: true,
      messaggio: "Connessione SMTP verificata correttamente.",
    };
  } catch (errore) {
    return {
      ok: false,
      messaggio: "Errore verifica SMTP",
      errore: errore.message,
    };
  }
}

async function inviaEmail({ to, subject, text, html }) {
  const fromName = process.env.SMTP_FROM_NAME || "Archivio ASPMI";
  const fromEmail = process.env.SMTP_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error("SMTP_FROM_EMAIL non configurato nel file .env");
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    html,
  });

  return info;
}

async function getDestinatariNotificheAttivi() {
  const [rows] = await pool.query(`
    SELECT id_notifica_email, email, nome_destinatario
    FROM notifiche_email
    WHERE attiva = 1
    ORDER BY nome_destinatario, email
  `);

  return rows;
}

async function inviaNotificaNuovoDocumento({
  protocollo,
  dataPubblicazione,
  oggetto,
  nomeFile,
  nomeCartella,
  nomeStato,
}) {
  const destinatari = await getDestinatariNotificheAttivi();

  if (!destinatari || destinatari.length === 0) {
    return {
      ok: false,
      messaggio: "Nessun destinatario attivo trovato per l'invio delle notifiche.",
    };
  }

  const listaEmail = destinatari.map((d) => d.email).join(", ");

  const subject = "Nuovo documento caricato nell'Archivio ASPMI";

  const text = `
È stato caricato un nuovo documento nell'Archivio ASPMI.

Protocollo: ${protocollo || ""}
Data pubblicazione: ${dataPubblicazione || ""}
Oggetto: ${oggetto || ""}
Nome file: ${nomeFile || ""}
Cartella: ${nomeCartella || ""}
Stato: ${nomeStato || ""}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
      <h2>Nuovo documento caricato nell'Archivio ASPMI</h2>
      <p>È stato caricato un nuovo documento nell'archivio.</p>

      <table cellpadding="6" cellspacing="0" border="0">
        <tr>
          <td><strong>Protocollo</strong></td>
          <td>${protocollo || ""}</td>
        </tr>
        <tr>
          <td><strong>Data pubblicazione</strong></td>
          <td>${dataPubblicazione || ""}</td>
        </tr>
        <tr>
          <td><strong>Oggetto</strong></td>
          <td>${oggetto || ""}</td>
        </tr>
        <tr>
          <td><strong>Nome file</strong></td>
          <td>${nomeFile || ""}</td>
        </tr>
        <tr>
          <td><strong>Cartella</strong></td>
          <td>${nomeCartella || ""}</td>
        </tr>
        <tr>
          <td><strong>Stato</strong></td>
          <td>${nomeStato || ""}</td>
        </tr>
      </table>
    </div>
  `;

  const info = await inviaEmail({
    to: listaEmail,
    subject,
    text,
    html,
  });

  return {
    ok: true,
    messaggio: "Notifica inviata correttamente",
    destinatari,
    messageId: info.messageId,
  };
}

module.exports = {
  verificaConfigurazioneEmail,
  inviaEmail,
  getDestinatariNotificheAttivi,
  inviaNotificaNuovoDocumento,
};