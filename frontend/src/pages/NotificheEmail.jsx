import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const COLUMN_STORAGE_KEY = 'aspmi_notifiche_email_column_widths';

const DEFAULT_COLUMN_WIDTHS = {
  email: 320,
  nome_destinatario: 220,
  attiva: 110,
  note: 280,
  azioni: 150
};

function NotificheEmail({ keycloak, onOperazioneCompletata }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');

  const [form, setForm] = useState({
    id_notifica_email: null,
    email: '',
    nome_destinatario: '',
    attiva: true,
    note: ''
  });

  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  const [sortConfig, setSortConfig] = useState({
    key: 'email',
    direction: 'asc'
  });

  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!saved) return DEFAULT_COLUMN_WIDTHS;
      return {
        ...DEFAULT_COLUMN_WIDTHS,
        ...JSON.parse(saved)
      };
    } catch {
      return DEFAULT_COLUMN_WIDTHS;
    }
  });

  const resizeRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch (error) {
      console.warn('Impossibile salvare le larghezze colonne notifiche:', error);
    }
  }, [columnWidths]);

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

  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem(COLUMN_STORAGE_KEY);
    } catch (error) {
      console.warn('Impossibile ripristinare larghezze notifiche:', error);
    }
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

  const caricaDati = async () => {
    try {
      setLoading(true);
      setErrore('');

      const response = await axios.get(
        `${API_BASE_URL}/notifiche-email`,
        await getAuthConfig()
      );

      setRecords(response.data.dati || []);
    } catch (error) {
      console.error(error);
      setErrore('Errore nel caricamento degli indirizzi email di notifica.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated) {
      caricaDati();
    }
  }, [keycloak?.authenticated]);

  const sortedRecords = useMemo(() => {
    const copy = [...records];

    copy.sort((a, b) => {
      let valueA = a[sortConfig.key];
      let valueB = b[sortConfig.key];

      if (sortConfig.key === 'attiva') {
        valueA = Number(valueA || 0);
        valueB = Number(valueB || 0);
      } else {
        valueA = (valueA ?? '').toString().toLowerCase();
        valueB = (valueB ?? '').toString().toLowerCase();
      }

      if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return copy;
  }, [records, sortConfig]);

  const handleSort = (key) => {
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
        <button
          type="button"
          className="th-sort-btn"
          onClick={() => handleSort(key)}
        >
          {label} {renderSortIndicator(key)}
        </button>
        <div className="col-resizer" onMouseDown={(e) => startResize(e, key)} />
      </div>
    </th>
  );

  const resetForm = () => {
    setForm({
      id_notifica_email: null,
      email: '',
      nome_destinatario: '',
      attiva: true,
      note: ''
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSalvataggioInCorso(true);
      setErrore('');
      setMessaggio('');

      const payload = {
        email: form.email,
        nome_destinatario: form.nome_destinatario,
        attiva: form.attiva ? 1 : 0,
        note: form.note
      };

      if (form.id_notifica_email) {
        await axios.put(
          `${API_BASE_URL}/notifiche-email/${form.id_notifica_email}`,
          payload,
          await getAuthConfig()
        );

        setMessaggio('Indirizzo email aggiornato correttamente.');
        onOperazioneCompletata?.('Indirizzo email aggiornato correttamente.');
      } else {
        await axios.post(
          `${API_BASE_URL}/notifiche-email`,
          payload,
          await getAuthConfig()
        );

        setMessaggio('Indirizzo email aggiunto correttamente.');
        onOperazioneCompletata?.('Indirizzo email aggiunto correttamente.');
      }

      resetForm();
      await caricaDati();
    } catch (error) {
      console.error(error);
      setErrore(
        error.response?.data?.messaggio ||
          'Errore durante il salvataggio dell’indirizzo email.'
      );
    } finally {
      setSalvataggioInCorso(false);
    }
  };

  const handleModifica = (record) => {
    setErrore('');
    setMessaggio('');
    setForm({
      id_notifica_email: record.id_notifica_email,
      email: record.email || '',
      nome_destinatario: record.nome_destinatario || '',
      attiva: Number(record.attiva) === 1,
      note: record.note || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleElimina = async (record) => {
    const conferma = window.confirm(`Vuoi eliminare l'indirizzo ${record.email}?`);
    if (!conferma) return;

    try {
      setErrore('');
      setMessaggio('');

      await axios.delete(
        `${API_BASE_URL}/notifiche-email/${record.id_notifica_email}`,
        await getAuthConfig()
      );

      setMessaggio('Indirizzo email eliminato correttamente.');
      onOperazioneCompletata?.('Indirizzo email eliminato correttamente.');

      if (form.id_notifica_email === record.id_notifica_email) {
        resetForm();
      }

      await caricaDati();
    } catch (error) {
      console.error(error);
      setErrore(
        error.response?.data?.messaggio ||
          'Errore durante l’eliminazione dell’indirizzo email.'
      );
    }
  };

  const handleToggleAttiva = async (record) => {
    try {
      setErrore('');
      setMessaggio('');

      await axios.put(
        `${API_BASE_URL}/notifiche-email/${record.id_notifica_email}`,
        {
          email: record.email,
          nome_destinatario: record.nome_destinatario || '',
          attiva: Number(record.attiva) === 1 ? 0 : 1,
          note: record.note || ''
        },
        await getAuthConfig()
      );

      setMessaggio('Stato destinatario aggiornato correttamente.');
      await caricaDati();
    } catch (error) {
      console.error(error);
      setErrore(
        error.response?.data?.messaggio ||
          'Errore durante l’aggiornamento dello stato.'
      );
    }
  };

  return (
    <div className="admin-panel-shell">
      <div className="admin-panel-card">
        <div className="admin-panel-header">
          <div className="admin-panel-header-left">
            <div className="admin-panel-icon">✉</div>
            <div className="admin-panel-title-wrap">
              <h2>Gestione notifiche email</h2>
              <div className="admin-panel-subtitle">
                Configura i destinatari che ricevono le notifiche automatiche sui nuovi documenti.
              </div>
            </div>
          </div>

          <div className="admin-panel-badge">
            {records.length} indirizzi configurati
          </div>
        </div>

        <div className="admin-panel-body">
          {messaggio && <div className="messaggio-successo">{messaggio}</div>}
          {errore && <div className="errore">{errore}</div>}

          <div className="admin-note-box">
            Puoi aggiungere destinatari, attivarli o disattivarli temporaneamente e ordinare la tabella
            con le frecce nelle intestazioni. Le colonne possono anche essere ridimensionate.
          </div>

          <div className="admin-soft-box" style={{ marginTop: '18px' }}>
            <div className="admin-soft-box-title">
              {form.id_notifica_email ? 'Modifica destinatario' : 'Nuovo destinatario'}
            </div>
            <div className="admin-soft-box-text">
              Inserisci l’indirizzo email e, se vuoi, un nome descrittivo e una nota interna.
            </div>

            <form onSubmit={handleSubmit} style={{ width: '100%', marginTop: '16px' }}>
              <div className="admin-grid-soft">
                <div className="campo">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="nome@dominio.it"
                    required
                  />
                </div>

                <div className="campo">
                  <label>Nome destinatario</label>
                  <input
                    type="text"
                    value={form.nome_destinatario}
                    onChange={(e) => handleChange('nome_destinatario', e.target.value)}
                    placeholder="Nome descrittivo"
                  />
                </div>

                <div className="campo">
                  <label>Note</label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={(e) => handleChange('note', e.target.value)}
                    placeholder="Note facoltative"
                  />
                </div>

                <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    id="attiva_notifica_email"
                    type="checkbox"
                    checked={form.attiva}
                    onChange={(e) => handleChange('attiva', e.target.checked)}
                  />
                  <label htmlFor="attiva_notifica_email" style={{ marginBottom: 0 }}>
                    Attiva
                  </label>
                </div>
              </div>

              <div className="admin-actions-bar">
                <button
                  type="submit"
                  className="btn btn-primary btn-gradient-blue"
                  disabled={salvataggioInCorso}
                >
                  {form.id_notifica_email ? 'Salva modifiche' : 'Aggiungi indirizzo'}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-soft-slate"
                  onClick={resetForm}
                >
                  Nuovo
                </button>

                <button
                  type="button"
                  className="btn btn-light btn-soft-slate"
                  onClick={resetColumnWidths}
                >
                  Ripristina colonne
                </button>
              </div>
            </form>
          </div>

          <div className="admin-table-card">
            <div className="admin-table-card-header">
              <div>
                <div className="admin-table-card-title">Elenco destinatari</div>
                <div className="admin-table-card-subtitle">
                  Ordina le colonne e gestisci rapidamente ogni indirizzo.
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '18px' }}>Caricamento...</div>
            ) : (
              <div className="table-scroll-wrap">
                <table className="resizable-table">
                  <thead>
                    <tr>
                      {renderResizableHeader('Email', 'email')}
                      {renderResizableHeader('Nome destinatario', 'nome_destinatario')}
                      {renderResizableHeader('Attiva', 'attiva')}
                      {renderResizableHeader('Note', 'note')}
                      <th style={{ width: `${columnWidths.azioni}px` }}>
                        <div className="th-resizable">
                          <span className="th-static-label">Azioni</span>
                          <div className="col-resizer" onMouseDown={(e) => startResize(e, 'azioni')} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecords.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="nessun-risultato">
                          Nessun indirizzo configurato
                        </td>
                      </tr>
                    ) : (
                      sortedRecords.map((record) => (
                        <tr key={record.id_notifica_email}>
                          <td style={{ width: `${columnWidths.email}px` }}>{record.email}</td>
                          <td style={{ width: `${columnWidths.nome_destinatario}px` }}>
                            {record.nome_destinatario || '-'}
                          </td>
                          <td style={{ width: `${columnWidths.attiva}px` }}>
                            <span className={`soft-status-pill ${Number(record.attiva) === 1 ? 'attiva' : 'disattiva'}`}>
                              {Number(record.attiva) === 1 ? 'Attiva' : 'Disattiva'}
                            </span>
                          </td>
                          <td
                            className="wrap-cell"
                            style={{ width: `${columnWidths.note}px` }}
                            title={record.note || ''}
                          >
                            {record.note || '-'}
                          </td>
                          <td style={{ width: `${columnWidths.azioni}px` }}>
                            <div className="azioni-tabella compatta">
                              <button
                                className="action-icon-btn action-edit"
                                onClick={() => handleModifica(record)}
                                title="Modifica"
                                aria-label="Modifica"
                              >
                                ✎
                              </button>

                              <button
                                className="action-icon-btn action-info"
                                onClick={() => handleToggleAttiva(record)}
                                title={Number(record.attiva) === 1 ? 'Disattiva' : 'Attiva'}
                                aria-label={Number(record.attiva) === 1 ? 'Disattiva' : 'Attiva'}
                              >
                                {Number(record.attiva) === 1 ? '●' : '○'}
                              </button>

                              <button
                                className="action-icon-btn action-delete"
                                onClick={() => handleElimina(record)}
                                title="Elimina"
                                aria-label="Elimina"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotificheEmail;