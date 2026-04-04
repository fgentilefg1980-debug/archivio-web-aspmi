import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function DocumentoForm({
  keycloak,
  cartelle = [],
  stati = [],
  enti = [],
  documentoDaModificare = null,
  onSalvato,
  onAnnulla,
}) {
  const getInitialFormData = () => ({
    id_ente: "",
    id_sottoente: "",
    id_ufficio: "",
    id_cartella: "",
    id_stato: "",
    protocollo: "",
    data_pubblicazione: "",
    oggetto: "",
    descrizione_breve: "",
    note: "",
    file: null,
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [sottoenti, setSottoenti] = useState([]);
  const [uffici, setUffici] = useState([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [erroreLocale, setErroreLocale] = useState("");
  const [messaggioLocale, setMessaggioLocale] = useState("");

  const getAuthConfig = async () => {
    const headers = {};

    if (keycloak?.authenticated) {
      try {
        await keycloak.updateToken(30);
      } catch (error) {
        console.warn("Aggiornamento token fallito:", error);
      }

      if (keycloak.token) {
        headers.Authorization = `Bearer ${keycloak.token}`;
      }
    }

    return { headers };
  };

  useEffect(() => {
    if (documentoDaModificare) {
      setFormData({
        id_ente: documentoDaModificare.id_ente || "",
        id_sottoente: documentoDaModificare.id_sottoente || "",
        id_ufficio: documentoDaModificare.id_ufficio || "",
        id_cartella: documentoDaModificare.id_cartella || "",
        id_stato: documentoDaModificare.id_stato || "",
        protocollo: documentoDaModificare.protocollo || "",
        data_pubblicazione: documentoDaModificare.data_pubblicazione
          ? String(documentoDaModificare.data_pubblicazione).slice(0, 10)
          : "",
        oggetto: documentoDaModificare.oggetto || "",
        descrizione_breve: documentoDaModificare.descrizione_breve || "",
        note: documentoDaModificare.note || "",
        file: null,
      });

      setFileName(documentoDaModificare.nome_file_originale || "");
    } else {
      setFormData(getInitialFormData());
      setFileName("");
      setSottoenti([]);
      setUffici([]);
    }

    setErroreLocale("");
    setMessaggioLocale("");
  }, [documentoDaModificare]);

  useEffect(() => {
    const caricaSottoenti = async () => {
      if (!formData.id_ente) {
        setSottoenti([]);
        setUffici([]);
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/sottoenti?id_ente=${formData.id_ente}`,
          await getAuthConfig()
        );
        setSottoenti(response.data.dati || []);
      } catch (error) {
        console.error("Errore caricamento sottoenti:", error);
        setSottoenti([]);
      }
    };

    caricaSottoenti();
  }, [formData.id_ente]);

  useEffect(() => {
    const caricaUffici = async () => {
      if (!formData.id_sottoente) {
        setUffici([]);
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/uffici?id_sottoente=${formData.id_sottoente}`,
          await getAuthConfig()
        );
        setUffici(response.data.dati || []);
      } catch (error) {
        console.error("Errore caricamento uffici:", error);
        setUffici([]);
      }
    };

    caricaUffici();
  }, [formData.id_sottoente]);

  function handleChange(e) {
    const { name, value, files } = e.target;
    setErroreLocale("");
    setMessaggioLocale("");

    if (name === "file") {
      const selectedFile = files && files[0] ? files[0] : null;
      setFormData((prev) => ({
        ...prev,
        file: selectedFile,
      }));
      setFileName(selectedFile ? selectedFile.name : fileName);
      return;
    }

    if (name === "id_ente") {
      setFormData((prev) => ({
        ...prev,
        id_ente: value,
        id_sottoente: "",
        id_ufficio: "",
      }));
      return;
    }

    if (name === "id_sottoente") {
      setFormData((prev) => ({
        ...prev,
        id_sottoente: value,
        id_ufficio: "",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleAnnulla() {
    setFormData(getInitialFormData());
    setSottoenti([]);
    setUffici([]);
    setFileName("");
    setErroreLocale("");
    setMessaggioLocale("");

    if (onAnnulla) {
      onAnnulla();
    }
  }

  async function uploadFileToS3() {
    if (!formData.file) {
      return null;
    }

    const presignedResponse = await axios.post(
      `${API_BASE_URL}/documenti/presigned-upload`,
      {
        fileName: formData.file.name,
        contentType: formData.file.type,
        id_cartella: formData.id_cartella,
      },
      await getAuthConfig()
    );

    const {
      uploadUrl,
      bucket,
      key,
      nome_file,
      nome_file_originale,
      estensione_file,
    } = presignedResponse.data;

    await axios.put(uploadUrl, formData.file, {
      headers: {
        "Content-Type": formData.file.type || "application/octet-stream",
      },
    });

    return {
      nome_file,
      percorso_file: key,
      estensione_file,
      bucket_s3: bucket,
      chiave_s3: key,
      nome_file_originale,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErroreLocale("");
    setMessaggioLocale("");

    try {
      if (documentoDaModificare) {
        const nuovoFile = await uploadFileToS3();

        const payload = {
          id_ente: formData.id_ente || null,
          id_sottoente: formData.id_sottoente || null,
          id_ufficio: formData.id_ufficio || null,
          id_cartella: formData.id_cartella || null,
          id_stato: formData.id_stato || null,
          protocollo: formData.protocollo || null,
          data_pubblicazione: formData.data_pubblicazione || null,
          oggetto: formData.oggetto || null,
          descrizione_breve: formData.descrizione_breve || null,
          note: formData.note || null,
          ...(nuovoFile
            ? {
                ...nuovoFile,
                elimina_vecchio_allegato: true,
              }
            : {}),
        };

        await axios.put(
          `${API_BASE_URL}/documenti/${documentoDaModificare.id_documento}`,
          payload,
          await getAuthConfig()
        );

        if (onSalvato) {
          onSalvato(`Documento ${documentoDaModificare.id_documento} aggiornato con successo.`);
        } else {
          setMessaggioLocale(`Documento ${documentoDaModificare.id_documento} aggiornato con successo.`);
        }
        return;
      }

      const fileData = await uploadFileToS3();

      const payload = {
        id_ente: formData.id_ente || null,
        id_sottoente: formData.id_sottoente || null,
        id_ufficio: formData.id_ufficio || null,
        id_cartella: formData.id_cartella || null,
        id_stato: formData.id_stato || null,
        protocollo: formData.protocollo || null,
        data_pubblicazione: formData.data_pubblicazione || null,
        oggetto: formData.oggetto || null,
        descrizione_breve: formData.descrizione_breve || null,
        note: formData.note || null,
        ...(fileData || {
          nome_file: null,
          percorso_file: null,
          estensione_file: null,
          bucket_s3: null,
          chiave_s3: null,
          nome_file_originale: null,
        }),
      };

      const response = await axios.post(
        `${API_BASE_URL}/documenti`,
        payload,
        await getAuthConfig()
      );

      setFormData(getInitialFormData());
      setSottoenti([]);
      setUffici([]);
      setFileName("");

      if (onSalvato) {
        onSalvato(`Documento salvato con ID ${response.data.id_documento}.`);
      } else {
        setMessaggioLocale(`Documento salvato con ID ${response.data.id_documento}.`);
      }
    } catch (error) {
      console.error(error);
      setErroreLocale(
        error.response?.data?.error ||
          "Errore durante il salvataggio del documento."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card shadow-sm border-0">
      {messaggioLocale && <div className="messaggio-successo">{messaggioLocale}</div>}
      {erroreLocale && <div className="errore">{erroreLocale}</div>}

      <div className="card-body">
        <div className="row g-4">
          <div className="col-12">
            <h5 className="border-bottom pb-2">Classificazione</h5>
          </div>

          <div className="col-md-6">
            <label className="form-label">Cartella archivio *</label>
            <select
              name="id_cartella"
              className="form-select"
              value={formData.id_cartella}
              onChange={handleChange}
            >
              <option value="">Seleziona cartella</option>
              {cartelle.map((cartella) => (
                <option key={cartella.id_cartella} value={cartella.id_cartella}>
                  {cartella.percorso_completo || cartella.nome_cartella}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-6">
            <label className="form-label">Stato documento *</label>
            <select
              name="id_stato"
              className="form-select"
              value={formData.id_stato}
              onChange={handleChange}
            >
              <option value="">Seleziona stato</option>
              {stati.map((stato) => (
                <option key={stato.id_stato} value={stato.id_stato}>
                  {stato.nome_stato}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12">
            <h5 className="border-bottom pb-2">Provenienza</h5>
          </div>

          <div className="col-md-4">
            <label className="form-label">Ente</label>
            <select
              name="id_ente"
              className="form-select"
              value={formData.id_ente}
              onChange={handleChange}
            >
              <option value="">Seleziona ente</option>
              {enti.map((ente) => (
                <option key={ente.id_ente} value={ente.id_ente}>
                  {ente.ENTE}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label">Sottoente</label>
            <select
              name="id_sottoente"
              className="form-select"
              value={formData.id_sottoente}
              onChange={handleChange}
              disabled={!formData.id_ente}
            >
              <option value="">Seleziona sottoente</option>
              {sottoenti.map((sottoente) => (
                <option key={sottoente.id_sottoente} value={sottoente.id_sottoente}>
                  {sottoente.nome_sottoente}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label">Ufficio</label>
            <select
              name="id_ufficio"
              className="form-select"
              value={formData.id_ufficio}
              onChange={handleChange}
              disabled={!formData.id_sottoente}
            >
              <option value="">Seleziona ufficio</option>
              {uffici.map((ufficio) => (
                <option key={ufficio.id_ufficio} value={ufficio.id_ufficio}>
                  {ufficio.nome_ufficio}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12">
            <h5 className="border-bottom pb-2">Dati documento</h5>
          </div>

          <div className="col-md-4">
            <label className="form-label">Protocollo</label>
            <input
              type="text"
              name="protocollo"
              className="form-control"
              value={formData.protocollo}
              onChange={handleChange}
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">Data pubblicazione *</label>
            <input
              type="date"
              name="data_pubblicazione"
              className="form-control"
              value={formData.data_pubblicazione}
              onChange={handleChange}
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">
              {documentoDaModificare ? "Sostituisci allegato" : "File allegato"}
            </label>
            <input
              type="file"
              name="file"
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="col-12">
            <label className="form-label">Oggetto *</label>
            <input
              type="text"
              name="oggetto"
              className="form-control"
              value={formData.oggetto}
              onChange={handleChange}
            />
          </div>

          <div className="col-12">
            <label className="form-label">Descrizione breve</label>
            <textarea
              name="descrizione_breve"
              className="form-control"
              rows="3"
              value={formData.descrizione_breve}
              onChange={handleChange}
            />
          </div>

          <div className="col-12">
            <label className="form-label">Note</label>
            <textarea
              name="note"
              className="form-control"
              rows="4"
              value={formData.note}
              onChange={handleChange}
            />
          </div>

          <div className="col-12">
            <div className="alert alert-light border">
              <strong>File selezionato:</strong> {fileName || "Nessun file selezionato"}
            </div>
          </div>
        </div>
      </div>

      <div className="card-footer bg-white d-flex gap-2 justify-content-end">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={handleAnnulla}
          disabled={saving}
        >
          Annulla
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving
            ? "Salvataggio..."
            : documentoDaModificare
            ? "Aggiorna documento"
            : "Salva documento"}
        </button>
      </div>
    </form>
  );
}