import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

function buildTree(cartelle = []) {
  const map = new Map();
  const roots = [];

  cartelle.forEach((cartella) => {
    map.set(String(cartella.id_cartella), {
      ...cartella,
      id_cartella: String(cartella.id_cartella),
      id_cartella_padre: cartella.id_cartella_padre
        ? String(cartella.id_cartella_padre)
        : '',
      children: []
    });
  });

  map.forEach((node) => {
    if (node.id_cartella_padre && map.has(node.id_cartella_padre)) {
      map.get(node.id_cartella_padre).children.push(node);
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

function collectAllIds(nodes = []) {
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

function findPath(nodes = [], targetId) {
  if (!targetId) return [];

  const walk = (items, path = []) => {
    for (const item of items) {
      const next = [...path, item];
      if (String(item.id_cartella) === String(targetId)) return next;
      if (item.children?.length) {
        const found = walk(item.children, next);
        if (found.length) return found;
      }
    }
    return [];
  };

  return walk(nodes, []);
}

function filterTree(nodes = [], search = '') {
  const query = search.trim().toLowerCase();
  if (!query) return nodes;

  const walk = (items) => {
    const result = [];

    items.forEach((item) => {
      const title = String(item.nome_cartella || '').toLowerCase();
      const path = String(item.percorso_completo || '').toLowerCase();
      const desc = String(item.descrizione || '').toLowerCase();

      const filteredChildren = walk(item.children || []);
      const match =
        title.includes(query) || path.includes(query) || desc.includes(query);

      if (match || filteredChildren.length > 0) {
        result.push({
          ...item,
          children: filteredChildren
        });
      }
    });

    return result;
  };

  return walk(nodes);
}

function countDocumentsPerFolder(cartelle = [], documenti = []) {
  const counts = {};

  cartelle.forEach((c) => {
    counts[String(c.id_cartella)] = 0;
  });

  documenti.forEach((doc) => {
    const key = String(doc.id_cartella || '');
    if (key) {
      counts[key] = (counts[key] || 0) + 1;
    }
  });

  return counts;
}

function getStatusClass(nomeStato = '') {
  const value = String(nomeStato).toLowerCase();

  if (value.includes('valido')) return 'status-valid';
  if (value.includes('bozza')) return 'status-draft';
  if (value.includes('scad')) return 'status-expired';
  if (value.includes('abrog')) return 'status-abrogato';
  if (value.includes('sostit')) return 'status-sostituito';

  return 'status-neutral';
}

function TreeNode({
  node,
  level = 0,
  expandedIds,
  selectedId,
  onToggle,
  onSelect,
  docCounts
}) {
  const hasChildren = !!node.children?.length;
  const isExpanded = expandedIds.has(String(node.id_cartella));
  const isSelected = String(selectedId) === String(node.id_cartella);
  const count = docCounts[String(node.id_cartella)] || 0;

  return (
    <div className="tree-node-premium">
      <button
        type="button"
        className={`tree-node-row-premium ${isSelected ? 'active' : ''}`}
        onClick={() => onSelect(node)}
        style={{ paddingLeft: `${14 + level * 18}px` }}
        title={node.percorso_completo || node.nome_cartella}
      >
        <span
          className={`tree-chevron-premium ${hasChildren ? '' : 'empty'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id_cartella);
          }}
        >
          {hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
        </span>

        <span className="tree-folder-icon-premium">
          {hasChildren ? (isExpanded ? '📂' : '📁') : '🗂'}
        </span>

        <span className="tree-node-main-premium">
          <span className="tree-node-title-premium">{node.nome_cartella}</span>
          {node.percorso_completo && (
            <span className="tree-node-path-premium">{node.percorso_completo}</span>
          )}
        </span>

        <span className="tree-node-count-premium">{count}</span>
      </button>

      {hasChildren && isExpanded && (
        <div className="tree-node-children-premium">
          {node.children.map((child) => (
            <TreeNode
              key={child.id_cartella}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
              docCounts={docCounts}
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
  risultatiGlobali = [],
  isAdmin = false,
  onOpenDetail,
  onDownload,
  onEdit,
  onDelete
}) {
  const [cartellaSelezionata, setCartellaSelezionata] = useState(null);
  const [docsCartella, setDocsCartella] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [erroreLocale, setErroreLocale] = useState('');
  const [searchTree, setSearchTree] = useState('');
  const [searchDocs, setSearchDocs] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [documentoDettaglio, setDocumentoDettaglio] = useState(null);
  const [loadingDettaglio, setLoadingDettaglio] = useState(false);

  const alberoCompleto = useMemo(() => buildTree(cartelle), [cartelle]);
  const alberoFiltrato = useMemo(
    () => filterTree(alberoCompleto, searchTree),
    [alberoCompleto, searchTree]
  );

  const docCounts = useMemo(
    () => countDocumentsPerFolder(cartelle, risultatiGlobali),
    [cartelle, risultatiGlobali]
  );

  useEffect(() => {
    const ids = collectAllIds(alberoFiltrato);
    setExpandedIds(new Set(ids));
  }, [searchTree, alberoFiltrato]);

  useEffect(() => {
    if (!cartellaSelezionata && cartelle.length > 0) {
      const first = cartelle
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

      if (first) setCartellaSelezionata(first);
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
      setDocumentoDettaglio(null);

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

  const apriDettaglioInterno = async (idDocumento) => {
    try {
      setLoadingDettaglio(true);
      setErroreLocale('');

      const response = await axios.get(
        `${API_BASE_URL}/documenti/${idDocumento}`,
        await getAuthConfig()
      );

      const doc = response.data.dato || null;
      setDocumentoDettaglio(doc);

      if (onOpenDetail) {
        await onOpenDetail(idDocumento);
      }
    } catch (error) {
      console.error(error);
      setErroreLocale('Errore nel caricamento del dettaglio documento');
    } finally {
      setLoadingDettaglio(false);
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
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const breadcrumb = useMemo(
    () => findPath(alberoCompleto, cartellaSelezionata?.id_cartella),
    [alberoCompleto, cartellaSelezionata]
  );

  const documentiFiltrati = useMemo(() => {
    const query = searchDocs.trim().toLowerCase();
    if (!query) return docsCartella;

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

      return haystack.includes(query);
    });
  }, [docsCartella, searchDocs]);

  const ultimaPubblicazione = useMemo(() => {
    const validDates = documentiFiltrati
      .map((doc) => doc.data_pubblicazione)
      .filter(Boolean)
      .map((x) => new Date(x).getTime())
      .filter((x) => !Number.isNaN(x));

    if (!validDates.length) return '-';

    return new Date(Math.max(...validDates)).toLocaleDateString('it-IT');
  }, [documentiFiltrati]);

  return (
    <div className="archive-premium-shell">
      <div className="archive-premium-hero">
        <div>
          <div className="archive-premium-badge">Navigazione visuale archivio</div>
          <h2 className="archive-premium-title">Esplora l’archivio in modalità strutturata</h2>
          <p className="archive-premium-subtitle">
            Consulta l’intero albero documentale, seleziona una cartella e interagisci
            con i documenti in modo rapido, ordinato e professionale.
          </p>
        </div>

        <div className="archive-premium-stats">
          <div className="archive-stat-card">
            <span className="archive-stat-number">{cartelle.length}</span>
            <span className="archive-stat-label">Cartelle</span>
          </div>
          <div className="archive-stat-card">
            <span className="archive-stat-number">{documentiFiltrati.length}</span>
            <span className="archive-stat-label">Documenti cartella</span>
          </div>
          <div className="archive-stat-card">
            <span className="archive-stat-number">{ultimaPubblicazione}</span>
            <span className="archive-stat-label">Ultima pubblicazione</span>
          </div>
        </div>
      </div>

      {erroreLocale && <div className="errore">{erroreLocale}</div>}

      <div className="archive-premium-layout">
        <aside className="archive-premium-tree-panel">
          <div className="archive-premium-panel-head">
            <div>
              <h3>Albero archivio</h3>
              <p>Vista completa di cartelle e sottocartelle</p>
            </div>
          </div>

          <div className="archive-premium-panel-tools">
            <input
              type="text"
              value={searchTree}
              onChange={(e) => setSearchTree(e.target.value)}
              placeholder="Cerca nell'albero..."
              className="archive-premium-search"
            />

            <div className="archive-premium-tool-actions">
              <button
                type="button"
                className="btn btn-light btn-small btn-soft-slate"
                onClick={() => setExpandedIds(new Set(collectAllIds(alberoFiltrato)))}
              >
                Espandi
              </button>
              <button
                type="button"
                className="btn btn-light btn-small btn-soft-slate"
                onClick={() => setExpandedIds(new Set())}
              >
                Chiudi
              </button>
            </div>
          </div>

          <div className="archive-premium-tree-scroll">
            {alberoFiltrato.length === 0 ? (
              <div className="archive-premium-empty">
                Nessuna cartella trovata con questo filtro.
              </div>
            ) : (
              alberoFiltrato.map((node) => (
                <TreeNode
                  key={node.id_cartella}
                  node={node}
                  expandedIds={expandedIds}
                  selectedId={cartellaSelezionata?.id_cartella}
                  onToggle={toggleNode}
                  onSelect={setCartellaSelezionata}
                  docCounts={docCounts}
                />
              ))
            )}
          </div>
        </aside>

        <section className="archive-premium-docs-panel">
          <div className="archive-premium-panel-head">
            <div>
              <h3>{cartellaSelezionata?.nome_cartella || 'Seleziona una cartella'}</h3>
              <p>
                {cartellaSelezionata?.percorso_completo ||
                  'Clicca una cartella a sinistra per visualizzare i documenti'}
              </p>
            </div>
          </div>

          {breadcrumb.length > 0 && (
            <div className="archive-premium-breadcrumb">
              {breadcrumb.map((item, index) => (
                <span key={item.id_cartella} className="archive-premium-breadcrumb-item">
                  <button
                    type="button"
                    className="archive-premium-breadcrumb-btn"
                    onClick={() => setCartellaSelezionata(item)}
                  >
                    {item.nome_cartella}
                  </button>
                  {index < breadcrumb.length - 1 && (
                    <span className="archive-premium-breadcrumb-sep">›</span>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="archive-premium-doc-toolbar">
            <input
              type="text"
              value={searchDocs}
              onChange={(e) => setSearchDocs(e.target.value)}
              placeholder="Filtra i documenti di questa cartella..."
              className="archive-premium-search"
            />

            <div className="archive-premium-selection-pill">
              {cartellaSelezionata?.nome_cartella || 'Nessuna cartella'}
            </div>
          </div>

          {!cartellaSelezionata ? (
            <div className="archive-premium-empty">
              Seleziona una cartella dall’albero.
            </div>
          ) : loadingDocs ? (
            <div className="archive-premium-skeleton-grid">
              <div className="archive-premium-skeleton-card" />
              <div className="archive-premium-skeleton-card" />
              <div className="archive-premium-skeleton-card" />
            </div>
          ) : documentiFiltrati.length === 0 ? (
            <div className="archive-premium-empty">
              Nessun documento presente in questa cartella.
            </div>
          ) : (
            <div className="archive-premium-content-grid">
              <div className="archive-premium-doc-list">
                {documentiFiltrati.map((doc) => (
                  <div
                    key={doc.id_documento}
                    className={`archive-premium-doc-card ${
                      documentoDettaglio?.id_documento === doc.id_documento ? 'selected' : ''
                    }`}
                  >
                    <div className="archive-premium-doc-head">
                      <div className="archive-premium-doc-title" title={doc.oggetto}>
                        {doc.oggetto}
                      </div>
                      <span
                        className={`archive-premium-status ${getStatusClass(doc.nome_stato)}`}
                      >
                        {doc.nome_stato || 'Senza stato'}
                      </span>
                    </div>

                    <div className="archive-premium-doc-meta">
                      {doc.protocollo && (
                        <div><strong>Protocollo:</strong> {doc.protocollo}</div>
                      )}
                      <div>
                        <strong>Data:</strong>{' '}
                        {doc.data_pubblicazione
                          ? new Date(doc.data_pubblicazione).toLocaleDateString('it-IT')
                          : '-'}
                      </div>
                    </div>

                    <div className="archive-premium-doc-desc">
                      {doc.descrizione_breve || 'Nessuna descrizione disponibile.'}
                    </div>

                    <div className="archive-premium-doc-actions">
                      <button
                        type="button"
                        className="btn btn-light btn-small btn-soft-slate"
                        onClick={() => apriDettaglioInterno(doc.id_documento)}
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
                            onClick={() => onDelete(doc.id_documento, doc.oggetto)}
                          >
                            Elimina
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="archive-premium-detail-panel">
                {loadingDettaglio ? (
                  <div className="archive-premium-empty">Caricamento dettaglio...</div>
                ) : !documentoDettaglio ? (
                  <div className="archive-premium-empty">
                    Seleziona “Dettaglio” su un documento per visualizzarne i dati.
                  </div>
                ) : (
                  <>
                    <div className="archive-premium-detail-head">
                      <div className="archive-premium-detail-badge">Dettaglio documento</div>
                      <h3>{documentoDettaglio.oggetto || 'Documento'}</h3>
                    </div>

                    <div className="archive-premium-detail-grid">
                      <div className="archive-premium-detail-item">
                        <span className="label">Protocollo</span>
                        <span>{documentoDettaglio.protocollo || '-'}</span>
                      </div>

                      <div className="archive-premium-detail-item">
                        <span className="label">Data pubblicazione</span>
                        <span>
                          {documentoDettaglio.data_pubblicazione
                            ? new Date(documentoDettaglio.data_pubblicazione).toLocaleDateString('it-IT')
                            : '-'}
                        </span>
                      </div>

                      <div className="archive-premium-detail-item archive-premium-detail-full">
                        <span className="label">Descrizione</span>
                        <span>{documentoDettaglio.descrizione_breve || '-'}</span>
                      </div>

                      <div className="archive-premium-detail-item archive-premium-detail-full">
                        <span className="label">Cartella</span>
                        <span>
                          {documentoDettaglio.percorso_completo ||
                            documentoDettaglio.nome_cartella ||
                            '-'}
                        </span>
                      </div>

                      <div className="archive-premium-detail-item">
                        <span className="label">Stato</span>
                        <span>{documentoDettaglio.nome_stato || '-'}</span>
                      </div>

                      <div className="archive-premium-detail-item">
                        <span className="label">Nome file originale</span>
                        <span>{documentoDettaglio.nome_file_originale || '-'}</span>
                      </div>

                      <div className="archive-premium-detail-item">
                        <span className="label">Ente</span>
                        <span>{documentoDettaglio.nome_ente || '-'}</span>
                      </div>

                      <div className="archive-premium-detail-item">
                        <span className="label">Sottoente</span>
                        <span>{documentoDettaglio.nome_sottoente || '-'}</span>
                      </div>

                      <div className="archive-premium-detail-item archive-premium-detail-full">
                        <span className="label">Ufficio</span>
                        <span>{documentoDettaglio.nome_ufficio || '-'}</span>
                      </div>
                    </div>

                    <div className="archive-premium-detail-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-small btn-gradient-blue"
                        onClick={() => onDownload(documentoDettaglio.id_documento)}
                      >
                        Download
                      </button>

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            className="btn btn-small btn-soft-amber"
                            onClick={() => onEdit(documentoDettaglio.id_documento)}
                          >
                            Modifica
                          </button>

                          <button
                            type="button"
                            className="btn btn-small btn-soft-red"
                            onClick={() =>
                              onDelete(
                                documentoDettaglio.id_documento,
                                documentoDettaglio.oggetto
                              )
                            }
                          >
                            Elimina
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}