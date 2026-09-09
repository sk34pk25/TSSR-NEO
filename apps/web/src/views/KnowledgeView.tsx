import { useMemo, useState } from 'react';
import type { CompetencyDomain, KnowledgeEntry } from '@tssr/contracts';
import { useRoute, useSession } from '../state/hooks.ts';
import type { EmbeddableViewProps } from './embeddable.ts';

const DOMAIN_LABEL: Partial<Record<CompetencyDomain, string>> = {
  network: 'Reseau',
  systems: 'Systemes',
  support: 'Support',
  itsm: 'Gestion des services',
  security: 'Securite',
  monitoring: 'Supervision',
  backup: 'Sauvegarde',
  hardware: 'Materiel',
  virtualization: 'Virtualisation',
  cloud: 'Cloud',
  deployment: 'Deploiement',
  documentation: 'Documentation',
};

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object')
    return Object.values(value as Record<string, string>)[0] ?? '';
  return '';
}

/** Base de connaissances NEO : recherche locale, disponible hors ligne. */
export function KnowledgeView({ embedded = false }: EmbeddableViewProps = {}): JSX.Element {
  const session = useSession();
  const route = useRoute();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<CompetencyDomain | ''>('');
  const [openId, setOpenId] = useState<string | undefined>(route.param);

  const entries: KnowledgeEntry[] = useMemo(() => {
    if (query.trim().length >= 2) {
      return session.library
        .search(query, domain === '' ? { limit: 30 } : { limit: 30, domain })
        .map((hit) => hit.entry);
    }
    return session.library.all(domain === '' ? {} : { domain });
  }, [session.library, query, domain]);

  const open = openId === undefined ? undefined : session.library.entry(openId);
  const graph = useMemo(() => session.library.buildGraph(), [session.library]);
  const recommendations = useMemo(
    () => session.library.recommend(session.progress.competencies, 4),
    [session.library, session.progress.competencies],
  );

  return (
    <div>
      {embedded ? null : (
        <>
          <h1>NEO Knowledge</h1>
          <p className="neo-muted" style={{ maxWidth: '72ch' }}>
            Fiches redigees pour TSSR NEO. La recherche est locale et tolerante aux fautes de
            frappe : elle reste disponible sans connexion pour les modules telecharges.
          </p>
        </>
      )}

      {recommendations.length > 0 ? (
        <div className="banner">
          <div>
            <strong>Conseille pour vous</strong>
            <div className="neo-row" style={{ marginTop: 6 }}>
              {recommendations.map((item) => (
                <button
                  key={item.entryId}
                  type="button"
                  className="neo-tag neo-tag--accent"
                  onClick={() => setOpenId(item.entryId)}
                >
                  {item.title} ({item.reason})
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="neo-row" style={{ marginBottom: 'var(--neo-space-4)' }}>
        <input
          className="neo-input neo-grow"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un concept, une commande, un symptome"
          aria-label="Rechercher dans la base de connaissances"
        />
        <select
          className="neo-select"
          style={{ width: 'auto' }}
          value={domain}
          onChange={(event) => setDomain(event.target.value as CompetencyDomain | '')}
          aria-label="Filtrer par domaine"
        >
          <option value="">Tous les domaines</option>
          {[...new Set(session.library.all().map((e) => e.domain))].map((value) => (
            <option key={value} value={value}>
              {DOMAIN_LABEL[value] ?? value}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: open ? 'minmax(260px, 1fr) minmax(0, 2fr)' : '1fr',
          gap: 'var(--neo-space-4)',
        }}
      >
        <div className="neo-stack">
          {entries.length === 0 ? (
            <p className="neo-muted">Aucune fiche ne correspond. Essayez un terme plus general.</p>
          ) : null}
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="course-card"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setOpenId(entry.id)}
            >
              <div className="neo-row" style={{ justifyContent: 'space-between' }}>
                <strong>{text(entry.title)}</strong>
                <span className="neo-tag">{entry.kind}</span>
              </div>
              <span className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                {text(entry.summary)}
              </span>
            </button>
          ))}
        </div>

        {open ? (
          <article className="neo-card">
            <div className="neo-row" style={{ justifyContent: 'space-between' }}>
              <h2>{text(open.title)}</h2>
              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--sm"
                onClick={() => setOpenId(undefined)}
              >
                Fermer
              </button>
            </div>
            <div className="neo-row" style={{ gap: 6, marginBottom: 'var(--neo-space-3)' }}>
              <span className="neo-tag neo-tag--accent">
                {DOMAIN_LABEL[open.domain] ?? open.domain}
              </span>
              {open.competencies.map((id) => (
                <span key={id} className="neo-tag">
                  {id}
                </span>
              ))}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text(open.body)}</div>

            {open.command ? (
              <section style={{ marginTop: 'var(--neo-space-4)' }}>
                <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Syntaxe</h3>
                <pre
                  className="neo-mono"
                  style={{
                    background: 'var(--neo-bg-1)',
                    padding: 12,
                    borderRadius: 8,
                    overflowX: 'auto',
                  }}
                >
                  {open.command.syntax}
                </pre>
                <table className="neo-table">
                  <thead>
                    <tr>
                      <th>Commande</th>
                      <th>Effet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.command.examples.map((example) => (
                      <tr key={example.cmd}>
                        <td className="neo-mono">{example.cmd}</td>
                        <td className="neo-muted">{text(example.explanation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {open.command.cautions.length > 0 ? (
                  <ul style={{ paddingLeft: 18 }}>
                    {open.command.cautions.map((caution) => (
                      <li
                        key={text(caution)}
                        className="neo-tag neo-tag--warn"
                        style={{ display: 'block', marginTop: 6 }}
                      >
                        {text(caution)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {open.relatedIds.length > 0 ? (
              <section style={{ marginTop: 'var(--neo-space-4)' }}>
                <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>A consulter ensuite</h3>
                <div className="neo-row">
                  {open.relatedIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="neo-tag neo-tag--accent"
                      onClick={() => setOpenId(id)}
                    >
                      {text(session.library.entry(id)?.title) || id}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        ) : null}
      </div>

      <section style={{ marginTop: 'var(--neo-space-6)' }}>
        <h2>Graphe de connaissances</h2>
        <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
          Vue simple par defaut : ce que chaque fiche enseigne, et ce qu il vaut mieux avoir vu
          avant.
        </p>
        <table className="neo-table">
          <thead>
            <tr>
              <th>Element</th>
              <th>Type</th>
              <th>Relations</th>
            </tr>
          </thead>
          <tbody>
            {graph.nodes.map((node) => {
              const outgoing = graph.edges.filter((edge) => edge.from === node.id);
              return (
                <tr key={node.id}>
                  <td>{text(node.label)}</td>
                  <td className="neo-muted">{node.kind}</td>
                  <td className="neo-muted" style={{ fontSize: 'var(--neo-fs-xs)' }}>
                    {outgoing.length === 0
                      ? 'aucune'
                      : outgoing.map((edge) => `${edge.relation} vers ${edge.to}`).join(', ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
