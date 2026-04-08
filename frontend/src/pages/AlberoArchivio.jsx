import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

function costruisciAlbero(cartelle = []) {
  const nodes = new Map();
  const roots = [];

  cartelle.forEach((cartella) => {
    nodes.set(String(cartella.id_cartella), {
      ...cartella,
      id_cartella: String(cartella.id_cartella),
      id_cartella_padre: cartella.id_cartella_padre
        ? String(cartella.id_cartella_padre)
        : '',
      children: []
    });
  });

  nodes.forEach((node) => {
    if (node.id_cartella_padre && nodes.has(node.id_cartella_padre)) {
      nodes.get(node.id_cartella_padre).children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (items) => {
    items.sort((a, b) => {
      const ordineA = Number(a.ordine_visualizzazione ?? 0);
      const ordineB = Number(b.ordine_visualizzazione ?? 0);

      if (ordineA !== ordineB) return ordineA - ordineB;

      return String(a.nome_cartella || '').localeCompare(
        String(b.nome_cartella || ''),
        'it',
        { sensitivity: 'base' }
      );
    });

    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);

  return roots;
}

function raccogliIdsEspansi(nodes = []) {
  const ids = [];

  const walk = (items) => {
    items.forEach((item) => {
      ids.push(String(item.id_cartella));
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return ids;
}

function trovaPercorso(tree = [], targetId) {
  if (!targetId) return [];

  const walk = (nodes, path = []) => {
    for (const node of nodes) {
      const nextPath = [...path, node];
      if (String(node.id_cartella) === String(targetId)) {
        return nextPath;
      }
      if (node.children?.length) {
        const found = walk(node.children, nextPath);
        if (found.length) return found;
      }
    }
    return [];
  };

  return walk(tree, []);
}

function TreeNode({
  node,
  level = 0,
  expandedIds,
  onToggle,
  selectedId,
  onSelect
}) {
  const hasChildren = !!node.children?.length;
  const isExpanded = expandedIds.has(String(node.id_cartella));
  const isSelected = String(selectedId) === String(node.id_cartella);

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-node-row ${isSelected ? 'active' : ''}`}
        onClick={() => onSelect(node)}
        style={{ paddingLeft: `${14 + level * 18}px` }}
        title={node.percorso_completo || node.nome_cartella}
      >
        <span
          className={`tree-chevron ${hasChildren ? '' : 'tree-chevron-empty'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id_cartella);
          }}
        >
          {hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
        </span>

        <span className="tree-folder-icon">{isExpanded ? '📂' : '📁'}</span>

        <span className="tree-node-text">
          <span className="tree-node-title">{node.nome_cartella}</span>
          {node.descrizione && (
            <span className="tree-node-subtitle">{node.descrizione}</span>
          )}
        </span>
      </button>

      {hasChildren && isExpanded && (
        <div className="tree-node-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id_cartella}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlberoArchivio({
  keycloak,
  cartelle = [],
  isAdmin = false,
  onOpenDetail,
  onDownload,
  onEdit,
  onDelete,
  documentoDettaglio
}) {
  const [cartellaSelezionata, setCartellaSelezionata] = useState(null);
  const [docsCartella, setDocsCartella] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [erroreLocale, setErroreLocale] = useState('');
  const [testoLocale, setTestoLocale] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());

  const albero = useMemo(() => costruisciAlbero(cartelle), [cartelle]);

  useEffect(() => {
    const allIds = raccogliIdsEspansi(albero);
    setExpandedIds(new Set(allIds));
  }, [albero]);

  useEffect(() => {
    if (!cartellaSelezionata && cartelle.length > 0) {
      const prima = cartelle
        .slice()
        .sort((a, b) => {
          const ordineA = Number(a.ordine_visualizzazione ?? 0);
          const ordineB = Number(b.ordine_visualizzazione ?? 0);
          if (ordineA !== ordineB) return ordineA - ordineB;
          return String(a.nome_cartella || '').localeCompare(
            String(b.nome_cartella || ''),
            'it',
            { sensitivity: 'base' }
          );
        })[0];

      if (prima) {
        setCartellaSelezionata(prima);
      }
    }
  }, [cartelle, cartellaSelezionata]);

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

  const caricaDocumentiCartella = async (idCartella) => {
    if (!idCartella) {
      setDocsCartella([]);
      return;
    }

    try {
      setLoadingDocs(true);
      setErroreLocale('');

      const response = await axios.get(
        `${API_BASE_URL}/documenti/ricerca`,
        await getAuthConfig({
          params: { id_cartella: idCartella }
        })
      );

      setDocsCartella(response.data.dati || []);
    } catch (error) {
      console.error(error);
      setErroreLocale(
        `Errore nel caricamento documenti della cartella: ${
          error.response?.data?.error || error.message || 'Errore sconosciuto'
        }`
      );
      setDocsCartella([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated && cartellaSelezionata?.id_cartella) {
      caricaDocumentiCartella(cartellaSelezionata.id_cartella);
    }
  }, [keycloak?.authenticated, cartellaSelezionata?.id_cartella]);

  const toggleNode = (idCartella) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(idCartella);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  const percorsoBreadcrumb = useMemo(() => {
    return trovaPercorso(albero, cartellaSelezionata?.id_cartella);
  }, [albero, cartellaSelezionata]);

  const documentiFiltrati = useMemo(() => {
    const testo = testoLocale.trim().toLowerCase();
    if (!testo) return docsCartella;

    return docsCartella.filter((doc) => {
      const haystack = [
        doc.protocollo,
        doc.oggetto,
        doc.descrizione_breve,
        doc.nome_stato,
        doc.nome_file_originale
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(testo);
    });
  }, [docsCartella, testoLocale]);

  return (
    <div className="archive-tree-shell">
      <div className="archive-tree-hero">
        <div>
          <div className="archive-tree-badge">Vista completa archivio</div>
          <h2 className="archive-tree-title">Esplora l’intera struttura documentale</h2>
          <p className="archive-tree-subtitle">
            Seleziona una cartella dall’albero per visualizzare i documenti collegati,
            consultare il dettaglio e scaricare gli allegati.
          </p>
        </div>

        <div className="archive-tree-hero-stats">
          <div className="tree-stat-card">
            <span className="tree-stat-number">{cartelle.length}</span>
            <span className="tree-stat-label">Cartelle totali</span>
          </div>
          <div className="tree-stat-card">
            <span className="tree-stat-number">{documentiFiltrati.length}</span>
            <span className="tree-stat-label">Documenti visibili</span>
          </div>
        </div>
      </div>

      {erroreLocale && <div className="errore">{erroreLocale}</div>}

      <div className="archive-tree-layout">
        <aside className="archive-tree-sidebar">
          <div className="archive-tree-panel-header">
            <div>
              <h3>Albero archivio</h3>
              <p>Tutte le cartelle e sottocartelle disponibili</p>
            </div>

            <div className="archive-tree-toolbar">
              <button
                type="button"
                className="btn btn-light btn-small btn-soft-slate"
                onClick={() => setExpandedIds(new Set(raccogliIdsEspansi(albero)))}
              >
                Espandi tutto
              </button>
              <button
                type="button"
                className="btn btn-light btn-small btn-soft-slate"
                onClick={() => setExpandedIds(new Set())}
              >
                Chiudi tutto
              </button>
            </div>
          </div>

          <div className="archive-tree-list">
            {albero.length === 0 ? (
              <div className="archive-tree-empty">
                Nessuna cartella disponibile.
              </div>
            ) : (
              albero.map((node) => (
                <TreeNode
                  key={node.id_cartella}
                  node={node}
                  expandedIds={expandedIds}
                  onToggle={toggleNode}
                  selectedId={cartellaSelezionata?.id_cartella}
                  onSelect={setCartellaSelezionata}
                />
              ))
            )}
          </div>
        </aside>

        <section className="archive-tree-content">
          <div className="archive-tree-panel-header">
            <div>
              <h3>
                {cartellaSelezionata?.nome_cartella || 'Seleziona una cartella'}
              </h3>
              <p>
                {cartellaSelezionata?.descrizione ||
                  'Clicca una cartella nell’albero per vedere i documenti associati.'}
              </p>
            </div>

            <div className="archive-tree-search">
              <input
                type="text"
                value={testoLocale}
                onChange={(e) => setTestoLocale(e.target.value)}
                placeholder="Filtra i documenti di questa cartella..."
              />
            </div>
          </div>

          {percorsoBreadcrumb.length > 0 && (
            <div className="archive-breadcrumb">
              {percorsoBreadcrumb.map((item, index) => (
                <span key={item.id_cartella} className="archive-breadcrumb-item">
                  <button
                    type="button"
                    onClick={() => setCartellaSelezionata(item)}
                    className="archive-breadcrumb-btn"
                  >
                    {item.nome_cartella}
                  </button>
                  {index < percorsoBreadcrumb.length - 1 && (
                    <span className="archive-breadcrumb-sep">›</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {cartellaSelezionata && (
            <div className="archive-tree-selection-card">
              <div>
                <div className="archive-tree-selection-label">Cartella selezionata</div>
                <div className="archive-tree-selection-name">
                  {cartellaSelezionata.nome_cartella}
                </div>
                <div className="archive-tree-selection-path">
                  {cartellaSelezionata.percorso_completo || cartellaSelezionata.nome_cartella}
                </div>
              </div>

              <div className="archive-tree-selection-badge">
                {documentiFiltrati.length} documenti
              </div>
            </div>
          )}

          {loadingDocs ? (
            <div className="archive-tree-empty">Caricamento documenti...</div>
          ) : !cartellaSelezionata ? (
            <div className="archive-tree-empty">
              Seleziona una cartella dall’albero a sinistra.
            </div>
          ) : documentiFiltrati.length === 0 ? (
            <div className="archive-tree-empty">
              Nessun documento presente in questa cartella.
            </div>
          ) : (
            <div className="archive-doc-grid">
              {documentiFiltrati.map((doc) => (
                <div key={doc.id_documento} className="archive-doc-card">
                  <div className="archive-doc-top">
                    <div className="archive-doc-top-main">
                      <div className="archive-doc-title" title={doc.oggetto}>
                        {doc.oggetto}
                      </div>

                      <div className="archive-doc-meta">
                        {doc.protocollo && (
                          <span className="archive-doc-chip">Prot. {doc.protocollo}</span>
                        )}
                        {doc.nome_stato && (
                          <span className="archive-doc-chip archive-doc-chip-state">
                            {doc.nome_stato}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="archive-doc-body">
                    <div className="archive-doc-info-row">
                      <span className="archive-doc-info-label">Data</span>
                      <span>
                        {doc.data_pubblicazione
                          ? new Date(doc.data_pubblicazione).toLocaleDateString('it-IT')
                          : '-'}
                      </span>
                    </div>

                    <div className="archive-doc-info-row">
                      <span className="archive-doc-info-label">Cartella</span>
                      <span title={doc.percorso_completo || doc.nome_cartella}>
                        {doc.percorso_completo || doc.nome_cartella || '-'}
                      </span>
                    </div>

                    <div className="archive-doc-description">
                      {doc.descrizione_breve || 'Nessuna descrizione disponibile.'}
                    </div>
                  </div>

                  <div className="archive-doc-actions">
                    <button
                      type="button"
                      className="btn btn-light btn-small btn-soft-slate"
                      onClick={() => onOpenDetail(doc.id_documento)}
                    >
                      Dettaglio
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary btn-small btn-gradient-blue"
                      onClick={() => onDownload(doc.id_documento)}
                    >
                      Download
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className="btn btn-small btn-soft-amber"
                          onClick={() => onEdit(doc.id_documento)}
                        >
                          Modifica
                        </button>

                        <button
                          type="button"
                          className="btn btn-small btn-soft-red"
                          onClick={() =>
                            onDelete(doc.id_documento, doc.oggetto)
                          }
                        >
                          Elimina
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {documentoDettaglio && (
            <div className="archive-inline-detail">
              <div className="titolo-sezione">
                <h2>Dettaglio documento</h2>
              </div>

              <div className="griglia-dettaglio">
                <div className="item-dettaglio">
                  <span className="label">Protocollo</span>
                  <span>{documentoDettaglio.protocollo || '-'}</span>
                </div>

                <div className="item-dettaglio">
                  <span className="label">Data pubblicazione</span>
                  <span>
                    {documentoDettaglio.data_pubblicazione
                      ? new Date(documentoDettaglio.data_pubblicazione).toLocaleDateString('it-IT')
                      : '-'}
                  </span>
                </div>

                <div className="item-dettaglio item-dettaglio-full">
                  <span className="label">Oggetto</span>
                  <span>{documentoDettaglio.oggetto || '-'}</span>
                </div>

                <div className="item-dettaglio item-dettaglio-full">
                  <span className="label">Descrizione</span>
                  <span>{documentoDettaglio.descrizione_breve || '-'}</span>
                </div>

                <div className="item-dettaglio">
                  <span className="label">Cartella</span>
                  <span>
                    {documentoDettaglio.percorso_completo ||
                      documentoDettaglio.nome_cartella ||
                      '-'}
                  </span>
                </div>

                <div className="item-dettaglio">
                  <span className="label">Stato</span>
                  <span>{documentoDettaglio.nome_stato || '-'}</span>
                </div>

                <div className="item-dettaglio item-dettaglio-full">
                  <span className="label">Nome file originale</span>
                  <span>{documentoDettaglio.nome_file_originale || '-'}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}