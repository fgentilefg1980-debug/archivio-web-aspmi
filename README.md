# Archivio Web ASPMI

Web app per consultazione documenti ASPMI.

## Struttura
- `backend` = API Node.js + Express
- `frontend` = interfaccia React
- `MySQL` = database archivio_documenti
- `S3` = file documenti
- `Keycloak` = autenticazione utenti

## Funzioni attuali
- login utenti
- ricerca documenti
- filtro per cartella
- filtro per stato
- dettaglio documento
- download file da S3 con URL temporaneo

## Avvio locale

### Backend
```bash
cd backend
npm install
npm run dev