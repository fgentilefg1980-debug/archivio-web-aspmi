import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const emptyForm = {
  id_ente: '',
  id_sottoente: '',
  id_ufficio: '',
  id_cartella: '',
  id_stato: '',
  protocollo: '',
  data_pubblicazione: '',
  oggetto: '',
  descrizione_breve: '',
  note: ''
};

export default function NuovoDocumento({
  keycloak,
  documentoDaModificare = null,
  onSalvato,
  onAnnulla
}) {
  const [formData, setFormData] = useState(emptyForm);
  const [cartelle, setCartelle] = useState([]);
  const [stati, setStati] = useState([]);
  const [enti, setEnti] = useState([]);
  const [sottoenti, setSottoenti] = useState([]);
  const [uffici, setUffici] = useState([]);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');

  const isEditMode = !!documentoDaModificare;

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

  const caricaFiltriBase = async () => {
    try {
      const [resCartelle, resStati, resEnti] = await Promise.all([
        axios.get(`${API_BASE_URL}/cartelle`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/stati`, await getAuthConfig()),
        axios.get(`${API_BASE_URL}/enti`, await getAuthConfig())
      ]);

      setCartelle(resCartelle.data.dati || []);
      setStati(resStati.data.dati || []);
      setEnti(resEnti.data.dati || []);
    } catch (error) {
      console.error(error);
      setErrore(
        error.response?.data?.details ||
          error.response?.data?.error ||
          'Errore nel caricamento dei dati iniziali'
      );
    }
  };

  const caricaSottoenti = async (idEnte) => {
    if (!idEnte) {
      setSottoenti([]);
      setUffici([]);
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

  const caricaUffici = async (idSottoente) => {
    if (!idSottoente) {
      setUffici([]);
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

  useEffect(() => {
    caricaFiltriBase();
  }, []);

  useEffect(() => {
    const inizializzaModifica = async () => {
      if (!documentoDaModificare) {
        setFormData(emptyForm);
        setFile(null);
        setMessaggio('');
        setErrore('');
        return;
      }

      const dati = {
        id_ente: documentoDaModificare.id_ente ? String(documentoDaModificare.id_ente) : '',
        id_sottoente: documentoDaModificare.id_sottoente ? String(documentoDaModificare.id_sottoente) : '',
        id_ufficio: documentoDaModificare.id_ufficio ? String(documentoDaModificare.id_ufficio) : '',
        id_cartella: documentoDaModificare.id_cartella ? String(documentoDaModificare.id_cartella) : '',
        id_stato: documentoDaModificare.id_stato ? String(documentoDaModificare.id_stato) : '',
        protocollo: documentoDaModificare.protocollo || '',
        data_pubblicazione: documentoDaModificare.data_pubblicazione
          ? String(documentoDaModificare.data_pubblicazione).slice(0, 10)
          : '',
        oggetto: documentoDaModificare.oggetto || '',
        descrizione_breve: documentoDaModificare.descrizione_breve || '',
        note: documentoDaModificare.note || ''
      };

      setFormData(dati);
      setFile(null);
      setMessaggio('');
      setErrore('');

      if (dati.id_ente) {
        await caricaSottoenti(dati.id_ente);
      }

      if (dati.id_sottoente) {
        await caricaUffici(dati.id_sottoente);
      }
    };

    inizializzaModifica();
  }, [documentoDaModificare]);

  useEffect(() => {
    if (!formData.id_ente) {
      setSottoenti([]);
      setUffici([]);
      setFormData((prev) => ({
        ...prev,
        id_sottoente: '',
        id_ufficio: ''
      }));
      return;
    }

    caricaSottoenti(formData.id_ente);
  }, [formData.id_ente]);

  useEffect(() => {
    if (!formData.id_sottoente) {
      setUffici([]);
      setFormData((prev) => ({
        ...prev,
        id_ufficio: ''
      }));
      return;
    }

    caricaUffici(formData.id_sottoente);
  }, [formData.id_sottoente]);

  const fileInfoLabel = useMemo(() => {
    if (file) return file.name;
    if (documentoDaModificare?.nome_file_originale) {
      return `File attuale: ${documentoDaModificare.nome_file_originale}`;
    }
    return 'Nessun file selezionato';
  }, [file, documentoDaModificare]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;

    if (name === 'file') {
      setFile(files?.[0] || null);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const testDbTcp = async () => {
    try {
      setErrore('');
      setMessaggio('');

      const response = await axios.get(
        `${API_BASE_URL}/debug-tcp`,
        await getAuthConfig()
      );

      setMessaggio(`Test TCP DB: ${JSON.stringify(response.data)}`);
      console.log('DEBUG TCP DB:', response.data);
    } catch (error) {
      console.error('DEBUG TCP DB ERROR:', error);
      setErrore(
        error.response?.data
          ? `Test TCP DB KO: ${JSON.stringify(error.response.data)}`
          : `Test TCP DB KO: ${error.message}`
      );
    }
  };

  const testDbQuery = async () => {
    try {
      setErrore('');
      setMessaggio('');

      const response = await axios.get(
        `${API_BASE_URL}/test-db`,
        await getAuthConfig()
      );

      setMessaggio(`Test Query DB: ${JSON.stringify(response.data)}`);
      console.log('DEBUG QUERY DB:', response.data);
    } catch (error) {
      console.error('DEBUG QUERY DB ERROR:', error);
      setErrore(
        error.response?.data
          ? `Test Query DB KO: ${JSON.stringify(error.response.data)}`
          : `Test Query DB KO: ${error.message}`
      );
    }
  };

  const uploadFileSePresente = async () => {
    if (!file) {
      return null;
    }

    const presignedResponse = await axios.post(
      `${API_BASE_URL}/documenti/presigned-upload`,
      {
        fileName: file.name,
        id_cartella: formData.id_cartella,
        contentType: file.type || 'application/octet-stream'
      },
      await getAuthConfig()
    );

    const uploadData = presignedResponse.data;

    const form = new FormData();

    Object.entries(uploadData.fields).forEach(([key, value]) => {
      form.append(key, value);
    });

    form.append('file', file);

    const uploadResponse = await fetch(uploadData.uploadUrl, {
      method: 'POST',
      body: form,
      mode: 'cors'
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload S3 fallito: ${uploadResponse.status} - ${errorText}`);
    }

    return {
      nome_file: uploadData.nome_file,
      percorso_file: uploadData.key,
      estensione_file: uploadData.estensione_file,
      bucket_s3: uploadData.bucket,
      chiave_s3: uploadData.key,
      nome_file_originale: uploadData.nome_file_originale
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrore('');
    setMessaggio('');

    try {
      const payload = {
        id_ente: formData.id_ente || null,
        id_sottoente: formData.id_sottoente || null,
        id_ufficio: formData.id_ufficio || null,
        id_cartella: formData.id_cartella,
        id_stato: formData.id_stato,
        protocollo: formData.protocollo || null,
        data_pubblicazione: formData.data_pubblicazione,
        oggetto: formData.oggetto,
        descrizione_breve: formData.descrizione_breve || null,
        note: formData.note || null
      };

      const uploadInfo = await uploadFileSePresente();

      if (uploadInfo) {
        Object.assign(payload, uploadInfo);

        if (isEditMode) {
          payload.elimina_vecchio_allegato = true;
        }
      }

      if (isEditMode) {
        await axios.put(
          `${API_BASE_URL}/documenti/${documentoDaModificare.id_documento}`,
          payload,
          await getAuthConfig()
        );
        setMessaggio('Documento aggiornato con successo.');
        onSalvato?.('Documento aggiornato con successo.');
      } else {
        await axios.post(
          `${API_BASE_URL}/documenti`,
          payload,
          await getAuthConfig()
        );
        setFormData(emptyForm);
        setFile(null);
        setMessaggio('Documento inserito con successo.');
        onSalvato?.('Documento inserito con successo.');
      }
    } catch (error) {
      console.error(error);
      setErrore(
        error.response?.data?.details ||
          error.response?.data?.sqlMessage ||
          error.response?.data?.error ||
          error.message ||
          'Errore durante il salvataggio del documento'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="box-dettaglio">
      <div className="titolo-sezione">
        <h2>{isEditMode ? 'Modifica documento' : 'Nuovo documento'}</h2>
      </div>

      {messaggio && <div className="messaggio-successo">{messaggio}</div>}
      {errore && <div className="errore">{errore}</div>}

      <form onSubmit={handleSubmit} className="document-form-grid">
        <div className="campo">
          <label>Ente</label>
          <select name="id_ente" value={formData.id_ente} onChange={handleChange}>
            <option value="">Seleziona ente</option>
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
            name="id_sottoente"
            value={formData.id_sottoente}
            onChange={handleChange}
            disabled={!formData.id_ente}
          >
            <option value="">Seleziona sottoente</option>
            {sottoenti.map((item) => (
              <option key={item.id_sottoente} value={String(item.id_sottoente)}>
                {buildSottoenteLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Ufficio</label>
          <select
            name="id_ufficio"
            value={formData.id_ufficio}
            onChange={handleChange}
            disabled={!formData.id_sottoente}
          >
            <option value="">Seleziona ufficio</option>
            {uffici.map((item) => (
              <option key={item.id_ufficio} value={String(item.id_ufficio)}>
                {buildUfficioLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="campo campo-span-2">
          <label>Cartella archivio</label>
          <select name="id_cartella" value={formData.id_cartella} onChange={handleChange}>
            <option value="">Seleziona cartella</option>
            {cartelle.map((cartella) => (
              <option key={cartella.id_cartella} value={String(cartella.id_cartella)}>
                {buildCartellaLabel(cartella)}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Stato documento</label>
          <select name="id_stato" value={formData.id_stato} onChange={handleChange}>
            <option value="">Seleziona stato</option>
            {stati.map((stato) => (
              <option key={stato.id_stato} value={String(stato.id_stato)}>
                {stato.nome_stato}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Protocollo</label>
          <input
            type="text"
            name="protocollo"
            value={formData.protocollo}
            onChange={handleChange}
          />
        </div>

        <div className="campo">
          <label>Data pubblicazione</label>
          <input
            type="date"
            name="data_pubblicazione"
            value={formData.data_pubblicazione}
            onChange={handleChange}
          />
        </div>

        <div className="campo campo-span-3">
          <label>Oggetto</label>
          <input
            type="text"
            name="oggetto"
            value={formData.oggetto}
            onChange={handleChange}
          />
        </div>

        <div className="campo campo-span-3">
          <label>Descrizione breve</label>
          <textarea
            name="descrizione_breve"
            rows="3"
            value={formData.descrizione_breve}
            onChange={handleChange}
          />
        </div>

        <div className="campo campo-span-3">
          <label>Note</label>
          <textarea
            name="note"
            rows="4"
            value={formData.note}
            onChange={handleChange}
          />
        </div>

        <div className="campo campo-span-3">
          <label>Allegato</label>
          <input type="file" name="file" onChange={handleChange} />
          <div className="file-info-box">{fileInfoLabel}</div>
        </div>

        <div className="azioni campo-span-3">
          <button type="submit" className="btn btn-primary btn-gradient-violet" disabled={saving}>
            {saving
              ? 'Salvataggio in corso...'
              : isEditMode
                ? 'Aggiorna documento'
                : 'Salva documento'}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-soft-slate"
            onClick={onAnnulla}
          >
            Annulla
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-soft-slate"
            onClick={testDbTcp}
          >
            Test TCP DB
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-soft-slate"
            onClick={testDbQuery}
          >
            Test Query DB
          </button>
        </div>
      </form>
    </div>
  );
}