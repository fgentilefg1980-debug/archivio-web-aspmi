import { useEffect, useState } from 'react';
import axios from 'axios';
import './index.css';
import logo from './assets/logo.png';

const API_BASE_URL = import.meta.env.VITE_API_URL;

function App({ keycloak }) {
  const [testo, setTesto] = useState('');
  const [cartelle, setCartelle] = useState([]);
  const [stati, setStati] = useState([]);
  const [idCartella, setIdCartella] = useState('');
  const [idStato, setIdStato] = useState('');
  const [risultati, setRisultati] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState('');
  const [documentoDettaglio, setDocumentoDettaglio] = useState(null);

  const getAuthConfig = async (extraConfig = {}) => {
    const headers = {
      ...(extraConfig.headers || {})
    };

    if (keycloak?.authenticated) {
      try {
        await keycloak.updateToken(30);
      } catch (error) {
        console.warn('Aggiornamento token fallito:', error);
      }

      if (keycloak.token) {
        headers.Authorization = `Bearer ${keycloak.token}`;
      }
    }

    return {
      ...extraConfig,
      headers
    };
  };

  useEffect(() => {
    if (keycloak?.authenticated) {
      caricaFiltri();
      cercaDocumenti();
    }
  }, [keycloak?.authenticated]);

  const caricaFiltri = async () => {
    try {
      const [resCartelle, resStati] = await Promise.all([
        axios.get(`${API_BASE_URL}/cartelle`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/stati`, await getAuthConfig())
      ]);

      setCartelle(resCartelle.data.dati || []);
      setStati(resStati.data.dati || []);
    } catch (error) {
      console.error(error);
      setErrore('Errore nel caricamento dei filtri');
    }
  };

  const cercaDocumenti = async () => {
    try {
      setLoading(true);
      setErrore('');
      setDocumentoDettaglio(null);

      const params = {};
      if (testo.trim() !== '') params.testo = testo.trim();
      if (idCartella !== '') params.id_cartella = idCartella;
      if (idStato !== '') params.id_stato = idStato;

      const response = await axios.get(
        `${API_BASE_URL}/documenti/ricerca`,
        await getAuthConfig({ params })
      );

      setRisultati(response.data.dati || []);
    } catch (error) {
      console.error('Errore ricerca:', error);

      if (error.response?.data?.message) {
        setErrore(`Errore durante la ricerca documenti: ${error.response.data.message}`);
      } else if (error.response?.data?.error) {
        setErrore(`Errore durante la ricerca documenti: ${error.response.data.error}`);
      } else if (error.message) {
        setErrore(`Errore durante la ricerca documenti: ${error.message}`);
      } else {
        setErrore('Errore durante la ricerca documenti');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetFiltri = () => {
    setTesto('');
    setIdCartella('');
    setIdStato('');
    setDocumentoDettaglio(null);
  };

  const apriDettaglio = async (idDocumento) => {
    try {
      setErrore('');
      const response = await axios.get(
        `${API_BASE_URL}/documenti/${idDocumento}`,
        await getAuthConfig()
      );
      setDocumentoDettaglio(response.data.dato || null);
    } catch (error) {
      console.error(error);
      setErrore('Errore nel caricamento del dettaglio documento');
    }
  };

  const scaricaDocumento = async (idDocumento) => {
    try {
      setErrore('');
      const response = await axios.get(
        `${API_BASE_URL}/documenti/${idDocumento}/download`,
        await getAuthConfig()
      );

      const url = response.data.download_url;

      if (url) {
        window.open(url, '_blank');
      } else {
        setErrore('Link download non disponibile');
      }
    } catch (error) {
      console.error(error);
      setErrore('Errore nella generazione del download');
    }
  };

  if (!keycloak) {
    return (
      <div className="container">
        <p>Inizializzazione autenticazione...</p>
      </div>
    );
  }

  if (!keycloak.authenticated) {
    return (
      <div className="container">
        <div className="header-top">
          <div className="header-page header-flex">
            <img src={logo} alt="Logo ASPMI" className="logo" />
            <div>
              <h1>Archivio Documenti ASPMI</h1>
              <p className="sottotitolo">
                Ricerca, consulta e scarica i documenti dell’archivio ufficiale ASPMI.
              </p>
            </div>
          </div>
        </div>

        <div className="box-filtri" style={{ textAlign: 'center' }}>
          <h2>Accesso riservato</h2>
          <p>Per consultare l’archivio devi autenticarti.</p>
          <button
            className="btn btn-primary"
            onClick={() =>
              keycloak.login({
                redirectUri: window.location.origin
              })
            }
          >
            Accedi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-top">
        <div className="header-page header-flex">
          <img src={logo} alt="Logo ASPMI" className="logo" />

          <div>
            <h1>Archivio Documenti ASPMI</h1>
            <p className="sottotitolo">
              Ricerca, consulta e scarica i documenti dell’archivio ufficiale ASPMI.
            </p>
          </div>
        </div>

        <div className="utente-box">
          <span className="utente-nome">
            {keycloak.tokenParsed?.preferred_username || 'Utente'}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() =>
              keycloak.logout({
                redirectUri: window.location.origin
              })
            }
          >
            Logout
          </button>
        </div>
      </div>

      <div className="box-filtri">
        <div className="campo campo-testo">
          <label>Testo ricerca</label>
          <input
            type="text"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Cerca per oggetto, descrizione, protocollo..."
          />
        </div>

        <div className="campo">
          <label>Cartella</label>
          <select value={idCartella} onChange={(e) => setIdCartella(e.target.value)}>
            <option value="">Tutte le cartelle</option>
            {cartelle.map((cartella) => (
              <option key={cartella.id_cartella} value={cartella.id_cartella}>
                {cartella.nome_cartella}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Stato</label>
          <select value={idStato} onChange={(e) => setIdStato(e.target.value)}>
            <option value="">Tutti gli stati</option>
            {stati.map((stato) => (
              <option key={stato.id_stato} value={stato.id_stato}>
                {stato.nome_stato}
              </option>
            ))}
          </select>
        </div>

        <div className="azioni">
          <button className="btn btn-primary" onClick={cercaDocumenti}>
            Cerca
          </button>
          <button className="btn btn-secondary" onClick={resetFiltri}>
            Reset
          </button>
        </div>
      </div>

      {errore && <div className="errore">{errore}</div>}

      <div className="box-risultati">
        <div className="titolo-sezione">
          <h2>Risultati</h2>
          <span className="badge-risultati">{risultati.length} documenti</span>
        </div>

        {loading ? (
          <p>Caricamento...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Data</th>
                <th>Protocollo</th>
                <th>Oggetto</th>
                <th>Cartella</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {risultati.length === 0 ? (
                <tr>
                  <td colSpan="7" className="nessun-risultato">
                    Nessun documento trovato
                  </td>
                </tr>
              ) : (
                risultati.map((doc) => (
                  <tr key={doc.id_documento}>
                    <td>{doc.id_documento}</td>
                    <td>{new Date(doc.data_pubblicazione).toLocaleDateString('it-IT')}</td>
                    <td>{doc.protocollo}</td>
                    <td>{doc.oggetto}</td>
                    <td>{doc.nome_cartella}</td>
                    <td>{doc.nome_stato}</td>
                    <td>
                      <div className="azioni-tabella">
                        <button
                          className="btn btn-light"
                          onClick={() => apriDettaglio(doc.id_documento)}
                        >
                          Dettaglio
                        </button>
                        <button
                          className="btn btn-light"
                          onClick={() => scaricaDocumento(doc.id_documento)}
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {documentoDettaglio && (
        <div className="box-dettaglio">
          <div className="titolo-sezione">
            <h2>Dettaglio documento</h2>
          </div>

          <div className="griglia-dettaglio">
            <div className="item-dettaglio">
              <span className="label">ID</span>
              <span>{documentoDettaglio.id_documento}</span>
            </div>

            <div className="item-dettaglio">
              <span className="label">Protocollo</span>
              <span>{documentoDettaglio.protocollo}</span>
            </div>

            <div className="item-dettaglio">
              <span className="label">Data pubblicazione</span>
              <span>
                {new Date(documentoDettaglio.data_pubblicazione).toLocaleDateString('it-IT')}
              </span>
            </div>

            <div className="item-dettaglio item-dettaglio-full">
              <span className="label">Oggetto</span>
              <span>{documentoDettaglio.oggetto}</span>
            </div>

            <div className="item-dettaglio item-dettaglio-full">
              <span className="label">Descrizione</span>
              <span>{documentoDettaglio.descrizione_breve || '-'}</span>
            </div>

            <div className="item-dettaglio">
              <span className="label">Cartella</span>
              <span>{documentoDettaglio.nome_cartella || '-'}</span>
            </div>

            <div className="item-dettaglio">
              <span className="label">Stato</span>
              <span>{documentoDettaglio.nome_stato || '-'}</span>
            </div>

            <div className="item-dettaglio item-dettaglio-full">
              <span className="label">Ente</span>
              <span>{documentoDettaglio.ente || '-'}</span>
            </div>

            <div className="item-dettaglio item-dettaglio-full">
              <span className="label">Nome file originale</span>
              <span>{documentoDettaglio.nome_file_originale || '-'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;