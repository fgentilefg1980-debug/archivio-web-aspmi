import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './index.css';
import logo from './assets/logo.png';
import NuovoDocumento from './pages/NuovoDocumento';
import GestioneStrutture from './pages/GestioneStrutture';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const PAGE_SIZE = 10;
const COLUMN_STORAGE_KEY = 'aspmi_archivio_column_widths';
const COLUMN_VISIBILITY_STORAGE_KEY = 'aspmi_archivio_column_visibility';

const DEFAULT_COLUMN_WIDTHS = {
  data_pubblicazione: 120,
  protocollo: 220,
  oggetto: 460,
  percorso_completo: 340,
  nome_stato: 130,
  azioni: 170
};

const DEFAULT_COLUMN_VISIBILITY = {
  data_pubblicazione: true,
  protocollo: true,
  oggetto: true,
  percorso_completo: true,
  nome_stato: true,
  azioni: true
};

const COLUMN_DEFS = [
  { key: 'data_pubblicazione', label: 'Data' },
  { key: 'protocollo', label: 'Protocollo' },
  { key: 'oggetto', label: 'Oggetto' },
  { key: 'percorso_completo', label: 'Cartella' },
  { key: 'nome_stato', label: 'Stato' },
  { key: 'azioni', label: 'Azioni' }
];

function App({ keycloak }) {
  const [testo, setTesto] = useState('');
  const [cartelle, setCartelle] = useState([]);
  const [stati, setStati] = useState([]);
  const [enti, setEnti] = useState([]);
  const [sottoenti, setSottoenti] = useState([]);
  const [uffici, setUffici] = useState([]);

  const [idCartella, setIdCartella] = useState('');
  const [idStato, setIdStato] = useState('');
  const [idEnte, setIdEnte] = useState('');
  const [idSottoente, setIdSottoente] = useState('');
  const [idUfficio, setIdUfficio] = useState('');

  const [risultati, setRisultati] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [documentoDettaglio, setDocumentoDettaglio] = useState(null);
  const [vistaAttiva, setVistaAttiva] = useState('ricerca');
  const [documentoInModifica, setDocumentoInModifica] = useState(null);
  const [confermaEliminazione, setConfermaEliminazione] = useState(null);

  const [sortConfig, setSortConfig] = useState({
    key: 'data_pubblicazione',
    direction: 'desc'
  });
  const [currentPage, setCurrentPage] = useState(1);

  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!saved) return DEFAULT_COLUMN_WIDTHS;

      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_COLUMN_WIDTHS,
        ...parsed
      };
    } catch (error) {
      console.warn('Impossibile leggere le larghezze salvate:', error);
      return DEFAULT_COLUMN_WIDTHS;
    }
  });

  const [columnVisibility, setColumnVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (!saved) return DEFAULT_COLUMN_VISIBILITY;

      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_COLUMN_VISIBILITY,
        ...parsed
      };
    } catch (error) {
      console.warn('Impossibile leggere la visibilità colonne:', error);
      return DEFAULT_COLUMN_VISIBILITY;
    }
  });

  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [recentDocs, setRecentDocs] = useState([]);

  const resizeRef = useRef(null);
  const columnMenuRef = useRef(null);

  const adminRoles = ['admin', 'archivio_admin', 'aspmi_admin'];

  const userRoles = useMemo(() => {
    const realmRoles = keycloak?.tokenParsed?.realm_access?.roles || [];
    const clientRolesObject = keycloak?.tokenParsed?.resource_access || {};

    const clientRoles = Object.values(clientRolesObject).flatMap(
      (item) => item?.roles || []
    );

    return [...new Set([...realmRoles, ...clientRoles])];
  }, [keycloak?.tokenParsed]);

  const isAdmin = useMemo(() => {
    return userRoles.some((role) => adminRoles.includes(String(role).toLowerCase()));
  }, [userRoles]);

  const recentDocsForUser = recentDocs;

  useEffect(() => {
    document.title = 'ASPMI Archivio';
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch (error) {
      console.warn('Impossibile salvare le larghezze colonne:', error);
    }
  }, [columnWidths]);

  useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_VISIBILITY_STORAGE_KEY,
        JSON.stringify(columnVisibility)
      );
    } catch (error) {
      console.warn('Impossibile salvare la visibilità colonne:', error);
    }
  }, [columnVisibility]);

  useEffect(() => {
    if (!isAdmin && vistaAttiva !== 'ricerca') {
      setVistaAttiva('ricerca');
      setDocumentoInModifica(null);
    }
  }, [isAdmin, vistaAttiva]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizeRef.current) return;

      const { columnKey, startX, startWidth } = resizeRef.current;
      const nextWidth = Math.max(100, startWidth + (e.clientX - startX));

      setColumnWidths((prev) => ({
        ...prev,
        [columnKey]: nextWidth
      }));
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      document.body.classList.remove('col-resizing');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showColumnMenu &&
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target)
      ) {
        setShowColumnMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnMenu]);

  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem(COLUMN_STORAGE_KEY);
    } catch (error) {
      console.warn('Impossibile ripristinare le larghezze colonne:', error);
    }
  };

  const resetColumnVisibility = () => {
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
    try {
      localStorage.removeItem(COLUMN_VISIBILITY_STORAGE_KEY);
    } catch (error) {
      console.warn('Impossibile ripristinare la visibilità colonne:', error);
    }
  };

  const startResize = (e, columnKey) => {
    e.preventDefault();
    e.stopPropagation();

    resizeRef.current = {
      columnKey,
      startX: e.clientX,
      startWidth: columnWidths[columnKey]
    };

    document.body.classList.add('col-resizing');
  };

  const toggleColumnVisibility = (columnKey) => {
    if (columnKey === 'azioni') return;

    setColumnVisibility((prev) => {
      const visibleColumns = Object.entries(prev).filter(
        ([key, value]) => key !== 'azioni' && value
      );

      if (prev[columnKey] && visibleColumns.length === 1) {
        return prev;
      }

      return {
        ...prev,
        [columnKey]: !prev[columnKey]
      };
    });
  };

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

  const buildCartellaLabel = (cartella) =>
    cartella?.percorso_completo || cartella?.nome_cartella || '';

  const buildEnteLabel = (ente) => ente?.ENTE || '';

  const buildSottoenteLabel = (sottoente) => {
    if (!sottoente) return '';
    return sottoente.nome_ente
      ? `${sottoente.nome_ente} > ${sottoente.nome_sottoente}`
      : sottoente.nome_sottoente || '';
  };

  const buildUfficioLabel = (ufficio) => {
    if (!ufficio) return '';
    const parts = [];
    if (ufficio.nome_ente) parts.push(ufficio.nome_ente);
    if (ufficio.nome_sottoente) parts.push(ufficio.nome_sottoente);
    if (ufficio.nome_ufficio) parts.push(ufficio.nome_ufficio);
    return parts.join(' > ');
  };

  const caricaDocumentiRecenti = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/documenti/recenti`,
        await getAuthConfig()
      );

      setRecentDocs(response.data.dati || []);
    } catch (error) {
      console.error('Errore caricamento recenti:', error);
    }
  };

  const salvaDocumentoRecente = async (idDocumento) => {
    try {
      await axios.post(
        `${API_BASE_URL}/documenti/recenti/${idDocumento}`,
        {},
        await getAuthConfig()
      );

      await caricaDocumentiRecenti();
    } catch (error) {
      console.error('Errore salvataggio recente:', error);
    }
  };

  const svuotaRecentiUtente = async () => {
    try {
      await axios.delete(
        `${API_BASE_URL}/documenti/recenti`,
        await getAuthConfig()
      );
      setRecentDocs([]);
    } catch (error) {
      console.error('Errore cancellazione recenti:', error);
      setErrore('Errore durante lo svuotamento dei documenti recenti');
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated) {
      caricaFiltri();
    }
  }, [keycloak?.authenticated]);

  useEffect(() => {
    if (keycloak?.authenticated) {
      caricaDocumentiRecenti();
    }
  }, [keycloak?.authenticated]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (keycloak?.authenticated && vistaAttiva === 'ricerca') {
        cercaDocumenti();
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [testo, idCartella, idStato, idEnte, idSottoente, idUfficio, vistaAttiva]);

  useEffect(() => {
    const caricaSottoenti = async () => {
      if (!idEnte) {
        setSottoenti([]);
        setUffici([]);
        setIdSottoente('');
        setIdUfficio('');
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/sottoenti`,
          await getAuthConfig({ params: { id_ente: idEnte } })
        );
        setSottoenti(response.data.dati || []);
      } catch (error) {
        console.error(error);
        setSottoenti([]);
      }
    };

    if (keycloak?.authenticated && vistaAttiva === 'ricerca') {
      caricaSottoenti();
    }
  }, [idEnte, vistaAttiva]);

  useEffect(() => {
    const caricaUffici = async () => {
      if (!idSottoente) {
        setUffici([]);
        setIdUfficio('');
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/uffici`,
          await getAuthConfig({ params: { id_sottoente: idSottoente } })
        );
        setUffici(response.data.dati || []);
      } catch (error) {
        console.error(error);
        setUffici([]);
      }
    };

    if (keycloak?.authenticated && vistaAttiva === 'ricerca') {
      caricaUffici();
    }
  }, [idSottoente, vistaAttiva]);

  const caricaFiltri = async () => {
    try {
      const [resCartelle, resStati, resEnti] = await Promise.all([
        axios.get(`${API_BASE_URL}/cartelle`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/stati`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/enti`, await getAuthConfig())
      ]);

      setCartelle(resCartelle.data.dati || []);
      setStati(resStati.data.dati || []);
      setEnti((resEnti.data.dati || []).map((item) => ({
        ...item,
        id_ente: String(item.id_ente)
      })));
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
      if (testo.trim()) params.testo = testo.trim();
      if (idCartella) params.id_cartella = idCartella;
      if (idStato) params.id_stato = idStato;
      if (idEnte) params.id_ente = idEnte;
      if (idSottoente) params.id_sottoente = idSottoente;
      if (idUfficio) params.id_ufficio = idUfficio;

      const response = await axios.get(
        `${API_BASE_URL}/documenti/ricerca`,
        await getAuthConfig({ params })
      );

      setRisultati(response.data.dati || []);
      setCurrentPage(1);
    } catch (error) {
      console.error(error);
      setErrore(
        `Errore durante la ricerca documenti: ${
          error.response?.data?.error || error.message || 'Errore sconosciuto'
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const resetFiltri = () => {
    setTesto('');
    setIdCartella('');
    setIdStato('');
    setIdEnte('');
    setIdSottoente('');
    setIdUfficio('');
    setSottoenti([]);
    setUffici([]);
    setDocumentoDettaglio(null);
    setErrore('');
    setMessaggio('');
    setCurrentPage(1);
  };

  const apriDettaglio = async (idDocumento) => {
    try {
      setErrore('');
      const response = await axios.get(
        `${API_BASE_URL}/documenti/${idDocumento}`,
        await getAuthConfig()
      );

      const doc = response.data.dato || null;
      setDocumentoDettaglio(doc);

      if (doc?.id_documento) {
        await salvaDocumentoRecente(doc.id_documento);
      }
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

      await salvaDocumentoRecente(idDocumento);

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

  const chiediEliminazioneDocumento = (idDocumento, oggetto) => {
    if (!isAdmin) return;
    setConfermaEliminazione({ idDocumento, oggetto });
  };

  const annullaEliminazioneDocumento = () => {
    setConfermaEliminazione(null);
  };

  const confermaEliminazioneDocumento = async () => {
    if (!confermaEliminazione || !isAdmin) return;

    try {
      setErrore('');
      setMessaggio('');

      await axios.delete(
        `${API_BASE_URL}/documenti/${confermaEliminazione.idDocumento}`,
        await getAuthConfig()
      );

      if (documentoDettaglio?.id_documento === confermaEliminazione.idDocumento) {
        setDocumentoDettaglio(null);
      }

      if (documentoInModifica?.id_documento === confermaEliminazione.idDocumento) {
        setDocumentoInModifica(null);
        setVistaAttiva('ricerca');
      }

      setConfermaEliminazione(null);
      await cercaDocumenti();
      await caricaDocumentiRecenti();
      setMessaggio('Documento eliminato con successo.');
    } catch (error) {
      console.error(error);
      setErrore(
        `Errore eliminazione documento: ${
          error.response?.data?.error || 'Operazione non riuscita'
        }`
      );
    }
  };

  const avviaModificaDocumento = async (idDocumento) => {
    if (!isAdmin) return;

    try {
      setErrore('');
      const response = await axios.get(
        `${API_BASE_URL}/documenti/${idDocumento}`,
        await getAuthConfig()
      );

      setDocumentoInModifica(response.data.dato || null);
      setVistaAttiva('nuovo');
    } catch (error) {
      console.error(error);
      setErrore('Errore nel caricamento del documento da modificare');
    }
  };

  const gestisciSalvataggioDocumento = async (nuovoMessaggio = '') => {
    setDocumentoInModifica(null);
    setVistaAttiva('ricerca');
    await cercaDocumenti();
    setMessaggio(nuovoMessaggio || 'Operazione completata con successo.');
  };

  const gestisciAnnullaDocumento = () => {
    setDocumentoInModifica(null);
    setVistaAttiva('ricerca');
    setErrore('');
  };

  const handleSort = (key) => {
    setCurrentPage(1);
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        key,
        direction: 'asc'
      };
    });
  };

  const sortedResults = useMemo(() => {
    const sorted = [...risultati];

    sorted.sort((a, b) => {
      let valueA = a[sortConfig.key];
      let valueB = b[sortConfig.key];

      if (sortConfig.key === 'data_pubblicazione') {
        valueA = valueA ? new Date(valueA).getTime() : 0;
        valueB = valueB ? new Date(valueB).getTime() : 0;
      } else {
        valueA = (valueA ?? '').toString().toLowerCase();
        valueB = (valueB ?? '').toString().toLowerCase();
      }

      if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [risultati, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedResults.length / PAGE_SIZE));

  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedResults.slice(start, start + PAGE_SIZE);
  }, [sortedResults, currentPage]);

  const startItem = sortedResults.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, sortedResults.length);

  const renderSortIndicator = (key) => {
    if (sortConfig.key !== key) return <span className="sort-indicator">↕</span>;
    return (
      <span className="sort-indicator active">
        {sortConfig.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const renderResizableHeader = (label, key) => (
    <th style={{ width: `${columnWidths[key]}px` }}>
      <div className="th-resizable">
        <button type="button" className="th-sort-btn" onClick={() => handleSort(key)}>
          {label} {renderSortIndicator(key)}
        </button>
        <div className="col-resizer" onMouseDown={(e) => startResize(e, key)} />
      </div>
    </th>
  );

  const renderHeaderIfVisible = (label, key) => {
    if (!columnVisibility[key]) return null;
    return renderResizableHeader(label, key);
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
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <img src={logo} alt="Logo ASPMI" className="login-logo" />
            <div>
              <h1 className="login-title">ASPMI Archivio</h1>
              <p className="login-subtitle">
                Accesso riservato all’archivio documentale ASPMI
              </p>
              <p className="login-byline">by Francesco Gentile e Widian Seif</p>
            </div>
          </div>

          <div className="login-divider" />

          <div className="login-content">
            <div className="login-badge">Area autenticata</div>

            <h2 className="login-heading">Consulta l’archivio in modo semplice e sicuro</h2>

            <p className="login-text">
              Effettua l’accesso per cercare, consultare e scaricare i documenti
              dell’archivio ufficiale ASPMI.
            </p>

            <div className="login-feature-list">
              <div className="login-feature-item">Ricerca rapida per testo, cartella e stato</div>
              <div className="login-feature-item">Consultazione dettagliata dei documenti</div>
              <div className="login-feature-item">Download sicuro degli allegati</div>
            </div>

            <button
              className="btn btn-primary btn-gradient-blue login-btn"
              onClick={() => keycloak.login({ redirectUri: window.location.origin })}
            >
              Accedi all’archivio
            </button>
          </div>
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
            <p className="byline">by Francesco Gentile e Widian Seif</p>
          </div>
        </div>

        <div className="utente-box">
          <div className="utente-info">
            <span className="utente-nome">
              {keycloak.tokenParsed?.preferred_username || 'Utente'}
            </span>
            <span className={`utente-ruolo-badge ${isAdmin ? 'admin' : 'standard'}`}>
              {isAdmin ? 'Admin' : 'Utente'}
            </span>
          </div>

          <button
            className="btn btn-secondary btn-soft-slate"
            onClick={() => keycloak.logout({ redirectUri: window.location.origin })}
          >
            Logout
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="info-consultazione">
          <div className="info-consultazione-icon">ℹ</div>
          <div>
            <div className="info-consultazione-title">Accesso in consultazione</div>
            <div className="info-consultazione-text">
              Il tuo profilo può ricercare, visualizzare il dettaglio e scaricare i documenti.
              Le funzioni di inserimento, modifica, eliminazione e gestione strutture sono riservate agli amministratori.
            </div>
          </div>
        </div>
      )}

      <div className="top-nav-tabs">
        <button
          className={vistaAttiva === 'ricerca' ? 'nav-tab-btn nav-tab-blue active' : 'nav-tab-btn nav-tab-blue'}
          onClick={() => {
            setVistaAttiva('ricerca');
            setDocumentoInModifica(null);
          }}
        >
          Ricerca documenti
        </button>

        {isAdmin && (
          <>
            <button
              className={vistaAttiva === 'nuovo' ? 'nav-tab-btn nav-tab-violet active' : 'nav-tab-btn nav-tab-violet'}
              onClick={() => {
                setVistaAttiva('nuovo');
                setDocumentoInModifica(null);
                setErrore('');
                setMessaggio('');
              }}
            >
              {documentoInModifica ? 'Modifica documento' : 'Nuovo documento'}
            </button>

            <button
              className={vistaAttiva === 'strutture' ? 'nav-tab-btn nav-tab-green active' : 'nav-tab-btn nav-tab-green'}
              onClick={() => {
                setVistaAttiva('strutture');
                setDocumentoInModifica(null);
                setErrore('');
                setMessaggio('');
              }}
            >
              Gestione strutture
            </button>
          </>
        )}
      </div>

      {messaggio && <div className="messaggio-successo">{messaggio}</div>}
      {errore && <div className="errore">{errore}</div>}

      {vistaAttiva === 'ricerca' && (
        <>
          <div className="box-filtri box-filtri-avanzati">
            <div className="campo campo-testo campo-wide">
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
                  <option key={cartella.id_cartella} value={String(cartella.id_cartella)}>
                    {buildCartellaLabel(cartella)}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label>Stato</label>
              <select value={idStato} onChange={(e) => setIdStato(e.target.value)}>
                <option value="">Tutti gli stati</option>
                {stati.map((stato) => (
                  <option key={stato.id_stato} value={String(stato.id_stato)}>
                    {stato.nome_stato}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label>Ente</label>
              <select value={idEnte} onChange={(e) => setIdEnte(e.target.value)}>
                <option value="">Tutti gli enti</option>
                {enti.map((ente) => (
                  <option key={ente.id_ente} value={String(ente.id_ente)}>
                    {buildEnteLabel(ente)}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label>Sottoente</label>
              <select
                value={idSottoente}
                onChange={(e) => setIdSottoente(e.target.value)}
                disabled={!idEnte}
              >
                <option value="">Tutti i sottoenti</option>
                {sottoenti.map((sottoente) => (
                  <option key={sottoente.id_sottoente} value={String(sottoente.id_sottoente)}>
                    {buildSottoenteLabel(sottoente)}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label>Ufficio</label>
              <select
                value={idUfficio}
                onChange={(e) => setIdUfficio(e.target.value)}
                disabled={!idSottoente}
              >
                <option value="">Tutti gli uffici</option>
                {uffici.map((ufficio) => (
                  <option key={ufficio.id_ufficio} value={String(ufficio.id_ufficio)}>
                    {buildUfficioLabel(ufficio)}
                  </option>
                ))}
              </select>
            </div>

            <div className="azioni azioni-filtri">
              <button className="btn btn-primary btn-gradient-blue" onClick={cercaDocumenti}>
                Cerca
              </button>
              <button className="btn btn-secondary btn-soft-slate" onClick={resetFiltri}>
                Reset
              </button>
            </div>
          </div>

          <div className="recenti-box">
            <div className="titolo-sezione recenti-header">
              <h2>Ultimi documenti consultati</h2>
              <div className="recenti-header-actions">
                <span className="badge-risultati">{recentDocsForUser.length} elementi</span>
                {recentDocsForUser.length > 0 && (
                  <button
                    className="btn btn-light btn-small btn-soft-slate"
                    onClick={svuotaRecentiUtente}
                  >
                    Svuota
                  </button>
                )}
              </div>
            </div>

            {recentDocsForUser.length === 0 ? (
              <div className="recenti-empty">
                Nessun documento recente per questo utente.
              </div>
            ) : (
              <div className="recenti-grid">
                {recentDocsForUser.map((doc) => (
                  <div key={doc.id_documento} className="recent-card">
                    <div className="recent-card-top">
                      <div className="recent-card-title" title={doc.oggetto}>
                        {doc.oggetto}
                      </div>
                      {doc.nome_stato && (
                        <span className="recent-card-badge">{doc.nome_stato}</span>
                      )}
                    </div>

                    <div className="recent-card-meta">
                      {doc.protocollo && <div><strong>Protocollo:</strong> {doc.protocollo}</div>}
                      {doc.data_pubblicazione && (
                        <div>
                          <strong>Data:</strong>{' '}
                          {new Date(doc.data_pubblicazione).toLocaleDateString('it-IT')}
                        </div>
                      )}
                      {doc.percorso_completo && (
                        <div className="recent-card-folder" title={doc.percorso_completo}>
                          <strong>Cartella:</strong> {doc.percorso_completo}
                        </div>
                      )}
                    </div>

                    <div className="recent-card-actions">
                      <button
                        className="btn btn-light btn-small btn-soft-slate"
                        onClick={() => apriDettaglio(doc.id_documento)}
                      >
                        Dettaglio
                      </button>
                      <button
                        className="btn btn-primary btn-small btn-gradient-blue"
                        onClick={() => scaricaDocumento(doc.id_documento)}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="box-risultati">
            <div className="titolo-sezione">
              <h2>Risultati</h2>
              <span className="badge-risultati">{sortedResults.length} documenti</span>
            </div>

            {!loading && sortedResults.length > 0 && (
              <div className="table-toolbar">
                <span className="table-summary">
                  Mostrati {startItem}-{endItem} di {sortedResults.length}
                </span>

                <div className="pagination-controls">
                  <div className="column-visibility-wrap" ref={columnMenuRef}>
                    <button
                      className="btn btn-light btn-small btn-soft-slate"
                      onClick={() => setShowColumnMenu((prev) => !prev)}
                      title="Mostra o nascondi colonne"
                    >
                      👁 Colonne
                    </button>

                    {showColumnMenu && (
                      <div className="column-visibility-menu">
                        <div className="column-visibility-title">Colonne visibili</div>

                        {COLUMN_DEFS.map((column) => (
                          <label key={column.key} className="column-visibility-item">
                            <input
                              type="checkbox"
                              checked={!!columnVisibility[column.key]}
                              onChange={() => toggleColumnVisibility(column.key)}
                              disabled={column.key === 'azioni'}
                            />
                            <span>{column.label}</span>
                          </label>
                        ))}

                        <div className="column-visibility-footer">
                          <button
                            className="btn btn-light btn-small btn-soft-slate"
                            onClick={resetColumnVisibility}
                          >
                            Ripristina visibilità
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-light btn-small btn-soft-slate"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Precedente
                  </button>

                  <span className="page-indicator">
                    Pagina {currentPage} di {totalPages}
                  </span>

                  <button
                    className="btn btn-light btn-small btn-soft-slate"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Successiva
                  </button>

                  <button
                    className="btn btn-light btn-small btn-soft-slate"
                    onClick={resetColumnWidths}
                    title="Ripristina larghezze colonne"
                  >
                    Ripristina colonne
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p>Caricamento...</p>
            ) : (
              <div className="table-scroll-wrap">
                <table className="resizable-table">
                  <thead>
                    <tr>
                      {renderHeaderIfVisible('Data', 'data_pubblicazione')}
                      {renderHeaderIfVisible('Protocollo', 'protocollo')}
                      {renderHeaderIfVisible('Oggetto', 'oggetto')}
                      {renderHeaderIfVisible('Cartella', 'percorso_completo')}
                      {renderHeaderIfVisible('Stato', 'nome_stato')}
                      {columnVisibility.azioni && (
                        <th
                          className="sticky-actions-col"
                          style={{ width: `${columnWidths.azioni}px` }}
                        >
                          <div className="th-resizable">
                            <span className="th-static-label">Azioni</span>
                            <div className="col-resizer" onMouseDown={(e) => startResize(e, 'azioni')} />
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Object.values(columnVisibility).filter(Boolean).length}
                          className="nessun-risultato"
                        >
                          Nessun documento trovato
                        </td>
                      </tr>
                    ) : (
                      paginatedResults.map((doc) => (
                        <tr key={doc.id_documento}>
                          {columnVisibility.data_pubblicazione && (
                            <td style={{ width: `${columnWidths.data_pubblicazione}px` }}>
                              {new Date(doc.data_pubblicazione).toLocaleDateString('it-IT')}
                            </td>
                          )}

                          {columnVisibility.protocollo && (
                            <td style={{ width: `${columnWidths.protocollo}px` }}>
                              {doc.protocollo}
                            </td>
                          )}

                          {columnVisibility.oggetto && (
                            <td
                              className="wrap-cell"
                              style={{ width: `${columnWidths.oggetto}px` }}
                              title={doc.oggetto}
                            >
                              {doc.oggetto}
                            </td>
                          )}

                          {columnVisibility.percorso_completo && (
                            <td
                              className="wrap-cell"
                              style={{ width: `${columnWidths.percorso_completo}px` }}
                              title={doc.percorso_completo || doc.nome_cartella}
                            >
                              {doc.percorso_completo || doc.nome_cartella}
                            </td>
                          )}

                          {columnVisibility.nome_stato && (
                            <td style={{ width: `${columnWidths.nome_stato}px` }}>
                              {doc.nome_stato}
                            </td>
                          )}

                          {columnVisibility.azioni && (
                            <td
                              className="sticky-actions-col"
                              style={{ width: `${columnWidths.azioni}px` }}
                            >
                              <div className="azioni-tabella compatta">
                                <button
                                  className="action-icon-btn action-info"
                                  onClick={() => apriDettaglio(doc.id_documento)}
                                  title="Dettaglio"
                                  aria-label="Dettaglio"
                                >
                                  ℹ
                                </button>

                                <button
                                  className="action-icon-btn action-download"
                                  onClick={() => scaricaDocumento(doc.id_documento)}
                                  title="Download"
                                  aria-label="Download"
                                >
                                  ↓
                                </button>

                                {isAdmin && (
                                  <>
                                    <button
                                      className="action-icon-btn action-edit"
                                      onClick={() => avviaModificaDocumento(doc.id_documento)}
                                      title="Modifica"
                                      aria-label="Modifica"
                                    >
                                      ✎
                                    </button>

                                    <button
                                      className="action-icon-btn action-delete"
                                      onClick={() => chiediEliminazioneDocumento(doc.id_documento, doc.oggetto)}
                                      title="Elimina"
                                      aria-label="Elimina"
                                    >
                                      ×
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {documentoDettaglio && (
            <div className="box-dettaglio">
              <div className="titolo-sezione">
                <h2>Dettaglio documento</h2>
              </div>

              <div className="griglia-dettaglio">
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
                  <span>{documentoDettaglio.percorso_completo || documentoDettaglio.nome_cartella || '-'}</span>
                </div>

                <div className="item-dettaglio">
                  <span className="label">Stato</span>
                  <span>{documentoDettaglio.nome_stato || '-'}</span>
                </div>

                <div className="item-dettaglio item-dettaglio-full">
                  <span className="label">Ente</span>
                  <span>{documentoDettaglio.nome_ente || '-'}</span>
                </div>

                <div className="item-dettaglio">
                  <span className="label">Sottoente</span>
                  <span>{documentoDettaglio.nome_sottoente || '-'}</span>
                </div>

                <div className="item-dettaglio">
                  <span className="label">Ufficio</span>
                  <span>{documentoDettaglio.nome_ufficio || '-'}</span>
                </div>

                <div className="item-dettaglio item-dettaglio-full">
                  <span className="label">Nome file originale</span>
                  <span>{documentoDettaglio.nome_file_originale || '-'}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isAdmin && vistaAttiva === 'nuovo' && (
        <NuovoDocumento
          keycloak={keycloak}
          documentoDaModificare={documentoInModifica}
          onSalvato={gestisciSalvataggioDocumento}
          onAnnulla={gestisciAnnullaDocumento}
        />
      )}

      {isAdmin && vistaAttiva === 'strutture' && (
        <GestioneStrutture
          keycloak={keycloak}
          onOperazioneCompletata={async (msg) => {
            await caricaFiltri();
            setMessaggio(msg || 'Operazione completata con successo.');
          }}
        />
      )}

      {isAdmin && confermaEliminazione && (
        <div className="modal-backdrop-custom">
          <div className="modal-card-custom">
            <div className="modal-card-header">
              <h3>Conferma eliminazione</h3>
            </div>
            <div className="modal-card-body">
              <p>Stai per eliminare definitivamente questo documento:</p>
              <p className="modal-oggetto-doc">
                {confermaEliminazione.oggetto || 'Documento selezionato'}
              </p>
              <p>Verrà eliminato anche l’allegato salvato su S3.</p>
            </div>
            <div className="modal-card-footer">
              <button className="btn btn-secondary btn-soft-slate" onClick={annullaEliminazioneDocumento}>
                Annulla
              </button>
              <button className="btn btn-danger btn-gradient-red" onClick={confermaEliminazioneDocumento}>
                Conferma eliminazione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;