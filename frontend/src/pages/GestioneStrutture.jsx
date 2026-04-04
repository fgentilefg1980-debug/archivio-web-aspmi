import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const emptyCartella = {
  id_cartella_padre: '',
  nome_cartella: '',
  descrizione: '',
  ordine_visualizzazione: 0
};

const emptyEnte = {
  ENTE: ''
};

const emptySottoente = {
  id_ente: '',
  nome_sottoente: '',
  descrizione: ''
};

const emptyUfficio = {
  id_sottoente: '',
  nome_ufficio: '',
  descrizione: ''
};

export default function GestioneStrutture({ keycloak, onOperazioneCompletata }) {
  const [cartelle, setCartelle] = useState([]);
  const [enti, setEnti] = useState([]);
  const [sottoenti, setSottoenti] = useState([]);
  const [uffici, setUffici] = useState([]);

  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');

  const [formCartella, setFormCartella] = useState(emptyCartella);
  const [formEnte, setFormEnte] = useState(emptyEnte);
  const [formSottoente, setFormSottoente] = useState(emptySottoente);
  const [formUfficio, setFormUfficio] = useState(emptyUfficio);

  const [editingCartellaId, setEditingCartellaId] = useState(null);
  const [editingEnteId, setEditingEnteId] = useState(null);
  const [editingSottoenteId, setEditingSottoenteId] = useState(null);
  const [editingUfficioId, setEditingUfficioId] = useState(null);

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

  const buildCartellaLabel = (cartella) => {
    return cartella?.percorso_completo || cartella?.nome_cartella || '';
  };

  const buildEnteLabel = (ente) => {
    return ente?.ENTE || '';
  };

  const buildSottoenteLabel = (sottoente) => {
    if (!sottoente) return '';
    if (sottoente.nome_ente) {
      return `${sottoente.nome_ente} > ${sottoente.nome_sottoente}`;
    }
    return sottoente.nome_sottoente || '';
  };

  const buildUfficioLabel = (ufficio) => {
    if (!ufficio) return '';
    const parts = [];
    if (ufficio.nome_ente) parts.push(ufficio.nome_ente);
    if (ufficio.nome_sottoente) parts.push(ufficio.nome_sottoente);
    if (ufficio.nome_ufficio) parts.push(ufficio.nome_ufficio);
    return parts.join(' > ');
  };

  const caricaDati = async () => {
    try {
      const [resCartelle, resEnti, resSottoenti, resUffici] = await Promise.all([
        axios.get(`${API_BASE_URL}/cartelle`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/enti`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/sottoenti`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/uffici`, await getAuthConfig())
      ]);

      setCartelle(resCartelle.data.dati || []);
      setEnti((resEnti.data.dati || []).map((x) => ({ ...x, id_ente: String(x.id_ente) })));
      setSottoenti(
        (resSottoenti.data.dati || []).map((x) => ({
          ...x,
          id_sottoente: String(x.id_sottoente),
          id_ente: String(x.id_ente)
        }))
      );
      setUffici(
        (resUffici.data.dati || []).map((x) => ({
          ...x,
          id_ufficio: String(x.id_ufficio),
          id_sottoente: String(x.id_sottoente)
        }))
      );
    } catch (error) {
      console.error(error);
      setErrore('Errore nel caricamento delle strutture');
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated) {
      caricaDati();
    }
  }, [keycloak]);

  const sottoentiFiltrati = useMemo(() => sottoenti, [sottoenti]);

  const resetCartella = () => {
    setFormCartella(emptyCartella);
    setEditingCartellaId(null);
  };

  const resetEnte = () => {
    setFormEnte(emptyEnte);
    setEditingEnteId(null);
  };

  const resetSottoente = () => {
    setFormSottoente(emptySottoente);
    setEditingSottoenteId(null);
  };

  const resetUfficio = () => {
    setFormUfficio(emptyUfficio);
    setEditingUfficioId(null);
  };

  const notifySuccess = async (msg) => {
    setMessaggio(msg);
    setErrore('');
    await caricaDati();
    onOperazioneCompletata?.(msg);
  };

  const handleSubmitCartella = async (e) => {
    e.preventDefault();
    setErrore('');
    setMessaggio('');

    try {
      let response;

      if (editingCartellaId) {
        response = await axios.put(
          `${API_BASE_URL}/cartelle/${editingCartellaId}`,
          formCartella,
          await getAuthConfig()
        );
      } else {
        response = await axios.post(
          `${API_BASE_URL}/cartelle`,
          {
            ...formCartella,
            id_cartella_padre: formCartella.id_cartella_padre || null
          },
          await getAuthConfig()
        );
      }

      resetCartella();
      await notifySuccess(response.data.messaggio || 'Operazione completata con successo');
    } catch (error) {
      console.error(error);
      setErrore(error.response?.data?.error || 'Errore salvataggio cartella');
    }
  };

  const handleSubmitEnte = async (e) => {
    e.preventDefault();
    setErrore('');
    setMessaggio('');

    try {
      let response;

      if (editingEnteId) {
        response = await axios.put(
          `${API_BASE_URL}/enti/${editingEnteId}`,
          formEnte,
          await getAuthConfig()
        );
      } else {
        response = await axios.post(
          `${API_BASE_URL}/enti`,
          formEnte,
          await getAuthConfig()
        );
      }

      resetEnte();
      await notifySuccess(response.data.messaggio || 'Operazione completata con successo');
    } catch (error) {
      console.error(error);
      setErrore(error.response?.data?.error || 'Errore salvataggio ente');
    }
  };

  const handleSubmitSottoente = async (e) => {
    e.preventDefault();
    setErrore('');
    setMessaggio('');

    try {
      let response;

      if (editingSottoenteId) {
        response = await axios.put(
          `${API_BASE_URL}/sottoenti/${editingSottoenteId}`,
          formSottoente,
          await getAuthConfig()
        );
      } else {
        response = await axios.post(
          `${API_BASE_URL}/sottoenti`,
          {
            ...formSottoente,
            id_ente: formSottoente.id_ente || null
          },
          await getAuthConfig()
        );
      }

      resetSottoente();
      await notifySuccess(response.data.messaggio || 'Operazione completata con successo');
    } catch (error) {
      console.error(error);
      setErrore(error.response?.data?.error || 'Errore salvataggio sottoente');
    }
  };

  const handleSubmitUfficio = async (e) => {
    e.preventDefault();
    setErrore('');
    setMessaggio('');

    try {
      let response;

      if (editingUfficioId) {
        response = await axios.put(
          `${API_BASE_URL}/uffici/${editingUfficioId}`,
          formUfficio,
          await getAuthConfig()
        );
      } else {
        response = await axios.post(
          `${API_BASE_URL}/uffici`,
          {
            ...formUfficio,
            id_sottoente: formUfficio.id_sottoente || null
          },
          await getAuthConfig()
        );
      }

      resetUfficio();
      await notifySuccess(response.data.messaggio || 'Operazione completata con successo');
    } catch (error) {
      console.error(error);
      setErrore(error.response?.data?.error || 'Errore salvataggio ufficio');
    }
  };

  const eliminaElemento = async (tipo, id) => {
    const conferma = window.confirm('Confermi l’eliminazione?');
    if (!conferma) return;

    setErrore('');
    setMessaggio('');

    try {
      const response = await axios.delete(
        `${API_BASE_URL}/${tipo}/${id}`,
        await getAuthConfig()
      );

      if (tipo === 'cartelle') resetCartella();
      if (tipo === 'enti') resetEnte();
      if (tipo === 'sottoenti') resetSottoente();
      if (tipo === 'uffici') resetUfficio();

      await notifySuccess(response.data.messaggio || 'Elemento eliminato con successo');
    } catch (error) {
      console.error(error);
      setErrore(error.response?.data?.error || 'Errore eliminazione');
    }
  };

  return (
    <div className="container py-4">
      <div className="mb-4 form-page-header">
        <div className="form-page-header-top">
          <h1 className="h3 mb-1">Gestione Strutture</h1>
          <span className="badge-mode badge-mode-new">Configurazione archivio</span>
        </div>
        <p className="text-muted mb-0">
          Crea, modifica ed elimina cartelle, enti, sottoenti e uffici collegati.
        </p>
      </div>

      {messaggio && <div className="messaggio-successo">{messaggio}</div>}
      {errore && <div className="errore">{errore}</div>}

      <div className="strutture-grid">
        <div className="card shadow-sm border-0 struttura-card">
          <div className="card-body">
            <h3 className="section-mini-title">
              {editingCartellaId ? 'Modifica cartella' : '1. Crea cartella o sottocartella'}
            </h3>
            <p className="card-helper-text">
              Se non selezioni una cartella padre, verrà creata una cartella principale.
            </p>

            <form onSubmit={handleSubmitCartella}>
              {!editingCartellaId && (
                <div className="campo">
                  <label>Cartella padre</label>
                  <select
                    value={formCartella.id_cartella_padre}
                    onChange={(e) =>
                      setFormCartella((prev) => ({
                        ...prev,
                        id_cartella_padre: e.target.value
                      }))
                    }
                  >
                    <option value="">Nessuna (cartella principale)</option>
                    {cartelle.map((cartella) => (
                      <option key={cartella.id_cartella} value={String(cartella.id_cartella)}>
                        {buildCartellaLabel(cartella)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="campo">
                <label>Nome cartella</label>
                <input
                  type="text"
                  value={formCartella.nome_cartella}
                  onChange={(e) =>
                    setFormCartella((prev) => ({
                      ...prev,
                      nome_cartella: e.target.value
                    }))
                  }
                />
              </div>

              <div className="campo">
                <label>Descrizione</label>
                <textarea
                  rows="3"
                  value={formCartella.descrizione}
                  onChange={(e) =>
                    setFormCartella((prev) => ({
                      ...prev,
                      descrizione: e.target.value
                    }))
                  }
                />
              </div>

              <div className="campo">
                <label>Ordine visualizzazione</label>
                <input
                  type="number"
                  value={formCartella.ordine_visualizzazione}
                  onChange={(e) =>
                    setFormCartella((prev) => ({
                      ...prev,
                      ordine_visualizzazione: Number(e.target.value || 0)
                    }))
                  }
                />
              </div>

              <div className="azioni mt-16">
                <button type="submit" className="btn btn-primary btn-gradient-blue">
                  {editingCartellaId ? 'Aggiorna cartella' : 'Salva cartella'}
                </button>
                {editingCartellaId && (
                  <button type="button" className="btn btn-secondary btn-soft-slate" onClick={resetCartella}>
                    Annulla modifica
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="card shadow-sm border-0 struttura-card">
          <div className="card-body">
            <h3 className="section-mini-title">
              {editingEnteId ? 'Modifica ente' : '2. Crea ente'}
            </h3>
            <p className="card-helper-text">
              Inserisci il nome dell’ente principale.
            </p>

            <form onSubmit={handleSubmitEnte}>
              <div className="campo">
                <label>Nome ente</label>
                <input
                  type="text"
                  value={formEnte.ENTE}
                  onChange={(e) => setFormEnte({ ENTE: e.target.value })}
                />
              </div>

              <div className="azioni mt-16">
                <button type="submit" className="btn btn-primary btn-gradient-violet">
                  {editingEnteId ? 'Aggiorna ente' : 'Salva ente'}
                </button>
                {editingEnteId && (
                  <button type="button" className="btn btn-secondary btn-soft-slate" onClick={resetEnte}>
                    Annulla modifica
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="card shadow-sm border-0 struttura-card">
          <div className="card-body">
            <h3 className="section-mini-title">
              {editingSottoenteId ? 'Modifica sottoente' : '3. Crea sottoente collegato'}
            </h3>
            <p className="card-helper-text">
              Seleziona prima l’ente a cui il sottoente deve appartenere.
            </p>

            <form onSubmit={handleSubmitSottoente}>
              <div className="campo">
                <label>Ente</label>
                <select
                  value={formSottoente.id_ente}
                  onChange={(e) =>
                    setFormSottoente((prev) => ({
                      ...prev,
                      id_ente: e.target.value
                    }))
                  }
                >
                  <option value="">Seleziona ente</option>
                  {enti.map((ente) => (
                    <option key={ente.id_ente} value={String(ente.id_ente)}>
                      {buildEnteLabel(ente)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label>Nome sottoente</label>
                <input
                  type="text"
                  value={formSottoente.nome_sottoente}
                  onChange={(e) =>
                    setFormSottoente((prev) => ({
                      ...prev,
                      nome_sottoente: e.target.value
                    }))
                  }
                />
              </div>

              <div className="campo">
                <label>Descrizione</label>
                <textarea
                  rows="3"
                  value={formSottoente.descrizione}
                  onChange={(e) =>
                    setFormSottoente((prev) => ({
                      ...prev,
                      descrizione: e.target.value
                    }))
                  }
                />
              </div>

              <div className="azioni mt-16">
                <button type="submit" className="btn btn-primary btn-gradient-green">
                  {editingSottoenteId ? 'Aggiorna sottoente' : 'Salva sottoente'}
                </button>
                {editingSottoenteId && (
                  <button type="button" className="btn btn-secondary btn-soft-slate" onClick={resetSottoente}>
                    Annulla modifica
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="card shadow-sm border-0 struttura-card">
          <div className="card-body">
            <h3 className="section-mini-title">
              {editingUfficioId ? 'Modifica ufficio' : '4. Crea ufficio collegato'}
            </h3>
            <p className="card-helper-text">
              Seleziona il sottoente a cui l’ufficio deve appartenere.
            </p>

            <form onSubmit={handleSubmitUfficio}>
              <div className="campo">
                <label>Sottoente</label>
                <select
                  value={formUfficio.id_sottoente}
                  onChange={(e) =>
                    setFormUfficio((prev) => ({
                      ...prev,
                      id_sottoente: e.target.value
                    }))
                  }
                >
                  <option value="">Seleziona sottoente</option>
                  {sottoentiFiltrati.map((sottoente) => (
                    <option key={sottoente.id_sottoente} value={String(sottoente.id_sottoente)}>
                      {buildSottoenteLabel(sottoente)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label>Nome ufficio</label>
                <input
                  type="text"
                  value={formUfficio.nome_ufficio}
                  onChange={(e) =>
                    setFormUfficio((prev) => ({
                      ...prev,
                      nome_ufficio: e.target.value
                    }))
                  }
                />
              </div>

              <div className="campo">
                <label>Descrizione</label>
                <textarea
                  rows="3"
                  value={formUfficio.descrizione}
                  onChange={(e) =>
                    setFormUfficio((prev) => ({
                      ...prev,
                      descrizione: e.target.value
                    }))
                  }
                />
              </div>

              <div className="azioni mt-16">
                <button type="submit" className="btn btn-primary btn-gradient-red">
                  {editingUfficioId ? 'Aggiorna ufficio' : 'Salva ufficio'}
                </button>
                {editingUfficioId && (
                  <button type="button" className="btn btn-secondary btn-soft-slate" onClick={resetUfficio}>
                    Annulla modifica
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="box-risultati">
        <div className="titolo-sezione">
          <h2>Riepilogo strutture già presenti</h2>
        </div>

        <div className="strutture-liste-grid">
          <div className="strutture-list-box">
            <h4>Cartelle</h4>
            <ul className="strutture-list">
              {cartelle.map((item) => (
                <li key={item.id_cartella}>
                  <strong>{item.nome_cartella}</strong>
                  <div className="small-muted">{buildCartellaLabel(item)}</div>
                  <div className="azioni-lista">
                    <button
                      className="btn btn-light btn-soft-amber btn-mini"
                      onClick={() => {
                        setEditingCartellaId(String(item.id_cartella));
                        setFormCartella({
                          id_cartella_padre: item.id_cartella_padre ? String(item.id_cartella_padre) : '',
                          nome_cartella: item.nome_cartella || '',
                          descrizione: item.descrizione || '',
                          ordine_visualizzazione: item.ordine_visualizzazione ?? 0
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Modifica
                    </button>
                    <button
                      className="btn btn-danger-soft btn-soft-red btn-mini"
                      onClick={() => eliminaElemento('cartelle', item.id_cartella)}
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="strutture-list-box">
            <h4>Enti</h4>
            <ul className="strutture-list">
              {enti.map((item) => (
                <li key={item.id_ente}>
                  <strong>{buildEnteLabel(item)}</strong>
                  <div className="azioni-lista">
                    <button
                      className="btn btn-light btn-soft-amber btn-mini"
                      onClick={() => {
                        setEditingEnteId(String(item.id_ente));
                        setFormEnte({ ENTE: item.ENTE || '' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Modifica
                    </button>
                    <button
                      className="btn btn-danger-soft btn-soft-red btn-mini"
                      onClick={() => eliminaElemento('enti', item.id_ente)}
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="strutture-list-box">
            <h4>Sottoenti</h4>
            <ul className="strutture-list">
              {sottoenti.map((item) => (
                <li key={item.id_sottoente}>
                  <strong>{item.nome_sottoente}</strong>
                  <div className="small-muted">
                    {buildSottoenteLabel(item)}
                  </div>
                  <div className="azioni-lista">
                    <button
                      className="btn btn-light btn-soft-amber btn-mini"
                      onClick={() => {
                        setEditingSottoenteId(String(item.id_sottoente));
                        setFormSottoente({
                          id_ente: item.id_ente ? String(item.id_ente) : '',
                          nome_sottoente: item.nome_sottoente || '',
                          descrizione: item.descrizione || ''
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Modifica
                    </button>
                    <button
                      className="btn btn-danger-soft btn-soft-red btn-mini"
                      onClick={() => eliminaElemento('sottoenti', item.id_sottoente)}
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="strutture-list-box">
            <h4>Uffici</h4>
            <ul className="strutture-list">
              {uffici.map((item) => (
                <li key={item.id_ufficio}>
                  <strong>{item.nome_ufficio}</strong>
                  <div className="small-muted">
                    {buildUfficioLabel(item)}
                  </div>
                  <div className="azioni-lista">
                    <button
                      className="btn btn-light btn-soft-amber btn-mini"
                      onClick={() => {
                        setEditingUfficioId(String(item.id_ufficio));
                        setFormUfficio({
                          id_sottoente: item.id_sottoente ? String(item.id_sottoente) : '',
                          nome_ufficio: item.nome_ufficio || '',
                          descrizione: item.descrizione || ''
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Modifica
                    </button>
                    <button
                      className="btn btn-danger-soft btn-soft-red btn-mini"
                      onClick={() => eliminaElemento('uffici', item.id_ufficio)}
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}