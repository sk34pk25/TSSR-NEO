import { useEffect, useState } from 'react';
import type { GraphicsQuality } from '@tssr/contracts';
import { useSession } from '../state/hooks.ts';

/** Reglages : rendu, accessibilite, confidentialite, donnees. */
export function SettingsView(): JSX.Element {
  const session = useSession();
  const prefs = session.progress.preferences;
  const [report, setReport] = useState<
    { totalBytes: number; reclaimableBytes: number } | undefined
  >(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    void session.storageReport().then(setReport);
  }, [session, session.lastSavedAt]);

  function update(patch: Parameters<typeof session.updatePreferences>[0]): void {
    void session.updatePreferences(patch);
  }

  function updateAccessibility(patch: Partial<typeof prefs.accessibility>): void {
    update({ accessibility: { ...prefs.accessibility, ...patch } });
  }

  return (
    <div className="neo-stack" style={{ maxWidth: 880 }}>
      <h1>Reglages</h1>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Rendu et performance</h2>
        <div className="neo-field" style={{ maxWidth: 320 }}>
          <label htmlFor="quality">Qualite graphique</label>
          <select
            id="quality"
            className="neo-select"
            value={prefs.graphicsQuality}
            onChange={(event) => update({ graphicsQuality: event.target.value as GraphicsQuality })}
          >
            <option value="auto">Automatique (detection des capacites)</option>
            <option value="performance">Performance</option>
            <option value="balanced">Equilibre</option>
            <option value="quality">Qualite</option>
            <option value="ultra">Ultra</option>
          </select>
        </div>
        <p className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)', marginTop: 8 }}>
          Profil actif : {session.profile.quality}, resolution x{session.profile.pixelRatio}, cible{' '}
          {session.profile.targetFps} images/s. La detection se base sur les capacites reelles du
          navigateur, jamais sur son identifiant.
        </p>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Accessibilite</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--neo-space-4)',
          }}
        >
          <div className="neo-field">
            <label htmlFor="text-size">Taille du texte</label>
            <select
              id="text-size"
              className="neo-select"
              value={prefs.accessibility.textSize}
              onChange={(event) =>
                updateAccessibility({ textSize: event.target.value as 's' | 'm' | 'l' | 'xl' })
              }
            >
              <option value="s">Compacte</option>
              <option value="m">Normale</option>
              <option value="l">Grande</option>
              <option value="xl">Tres grande</option>
            </select>
          </div>
          <div className="neo-field">
            <label htmlFor="ui-scale">Echelle de l interface</label>
            <input
              id="ui-scale"
              className="neo-input"
              type="range"
              min={0.85}
              max={1.4}
              step={0.05}
              value={prefs.accessibility.uiScale}
              onChange={(event) => updateAccessibility({ uiScale: Number(event.target.value) })}
            />
          </div>
          <div className="neo-field">
            <label htmlFor="contrast">Contraste</label>
            <select
              id="contrast"
              className="neo-select"
              value={prefs.accessibility.contrast}
              onChange={(event) =>
                updateAccessibility({ contrast: event.target.value as 'normal' | 'high' })
              }
            >
              <option value="normal">Standard</option>
              <option value="high">Renforce</option>
            </select>
          </div>
          <div className="neo-field">
            <label htmlFor="colorblind">Vision des couleurs</label>
            <select
              id="colorblind"
              className="neo-select"
              value={prefs.accessibility.colorBlindMode}
              onChange={(event) =>
                updateAccessibility({
                  colorBlindMode: event.target.value as
                    'none' | 'protanopia' | 'deuteranopia' | 'tritanopia',
                })
              }
            >
              <option value="none">Aucun ajustement</option>
              <option value="protanopia">Protanopie</option>
              <option value="deuteranopia">Deuteranopie</option>
              <option value="tritanopia">Tritanopie</option>
            </select>
          </div>
        </div>
        <div className="neo-row" style={{ marginTop: 'var(--neo-space-3)' }}>
          <label className="neo-row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={prefs.accessibility.reduceMotion}
              onChange={(event) => updateAccessibility({ reduceMotion: event.target.checked })}
            />
            Reduire les animations
          </label>
          <label className="neo-row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={prefs.accessibility.reduceVisualComplexity}
              onChange={(event) =>
                updateAccessibility({ reduceVisualComplexity: event.target.checked })
              }
            />
            Reduire la complexite visuelle
          </label>
          <label className="neo-row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={prefs.accessibility.subtitles}
              onChange={(event) => updateAccessibility({ subtitles: event.target.checked })}
            />
            Sous-titres
          </label>
        </div>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Accompagnement</h2>
        <div className="neo-row">
          <div className="neo-field" style={{ maxWidth: 260 }}>
            <label htmlFor="difficulty">Difficulte</label>
            <select
              id="difficulty"
              className="neo-select"
              value={prefs.difficulty}
              onChange={(event) =>
                update({ difficulty: event.target.value as typeof prefs.difficulty })
              }
            >
              <option value="adaptive">Adaptative</option>
              <option value="guided">Guidee</option>
              <option value="standard">Standard</option>
              <option value="advanced">Avancee</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div className="neo-field" style={{ maxWidth: 260 }}>
            <label htmlFor="nova">Presence de NOVA</label>
            <select
              id="nova"
              className="neo-select"
              value={prefs.novaVerbosity}
              onChange={(event) =>
                update({ novaVerbosity: event.target.value as typeof prefs.novaVerbosity })
              }
            >
              <option value="minimal">Discrete</option>
              <option value="normal">Normale</option>
              <option value="detailed">Detaillee</option>
            </select>
          </div>
        </div>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Confidentialite et donnees</h2>
        <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
          Aucune publicite, aucun traqueur, aucune donnee personnelle collectee. La telemetrie
          technique (images par seconde, erreurs de chargement) reste locale sauf accord explicite.
        </p>
        <label className="neo-row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={prefs.telemetryConsent}
            onChange={(event) => update({ telemetryConsent: event.target.checked })}
          />
          Autoriser l envoi de la telemetrie technique (aucun endpoint configure a ce jour)
        </label>

        <div className="neo-row" style={{ marginTop: 'var(--neo-space-4)' }}>
          <button
            type="button"
            className="neo-btn neo-btn--sm"
            onClick={() => {
              void session.exportProfile().then((json) => {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'tssr-neo-progression.json';
                anchor.click();
                URL.revokeObjectURL(url);
              });
            }}
          >
            Exporter ma progression
          </button>
          <label className="neo-btn neo-btn--sm neo-btn--ghost" style={{ cursor: 'pointer' }}>
            Importer un fichier
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file
                  .text()
                  .then((raw) =>
                    session.importProfile(raw).then((result) => setMessage(result.message)),
                  );
              }}
            />
          </label>
        </div>
        {message !== undefined ? (
          <p className="neo-tag neo-tag--accent" style={{ marginTop: 'var(--neo-space-3)' }}>
            {message}
          </p>
        ) : null}

        {report ? (
          <dl className="kv" style={{ marginTop: 'var(--neo-space-4)' }}>
            <dt>Stockage utilise</dt>
            <dd>{Math.round(report.totalBytes / 1024)} Ko</dd>
            <dt>Liberable sans perte</dt>
            <dd>{Math.round(report.reclaimableBytes / 1024)} Ko</dd>
            <dt>Support</dt>
            <dd>{session.storageMode === 'indexeddb' ? 'IndexedDB' : 'memoire volatile'}</dd>
          </dl>
        ) : null}
      </section>
    </div>
  );
}
