import { useEffect, useState } from 'react';
import { CORE_VERSION } from '../state/session.ts';
import { useSession } from '../state/hooks.ts';

declare const __TSSR_BUILD__: string;
/**
 * NEO Diagnostics.
 * Etat technique reel de l application. Aucun secret n y est expose.
 */
export function DiagnosticsView(): JSX.Element {
  const session = useSession();
  const [storage, setStorage] = useState<Record<string, number>>({});
  const [swState, setSwState] = useState('non evalue');

  useEffect(() => {
    void session.storageReport().then((report) => setStorage(report.byStore));
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        setSwState(registration === undefined ? 'non enregistre' : (registration.active?.state ?? 'en cours'));
      });
    } else {
      setSwState('non supporte par ce navigateur');
    }
  }, [session]);

  const capabilities = session.capabilities;

  return (
    <div className="neo-stack" style={{ maxWidth: 940 }}>
      <h1>NEO Diagnostics</h1>
      <p className="neo-muted">
        Etat technique mesure sur cet appareil. Ces informations restent locales.
      </p>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Version et environnement</h2>
        <dl className="kv">
          <dt>Version du Core</dt>
          <dd>{CORE_VERSION}</dd>
          <dt>Identifiant de build</dt>
          <dd>{typeof __TSSR_BUILD__ === 'string' ? __TSSR_BUILD__ : 'dev'}</dd>
          <dt>Chemin de base</dt>
          <dd>{typeof __TSSR_BASE_PATH__ === 'string' ? __TSSR_BASE_PATH__ : '/'}</dd>
          <dt>Modules charges</dt>
          <dd>{session.modules.map((m) => `${m.id}@${m.version}`).join(', ')}</dd>
          <dt>Compatibilite API</dt>
          <dd>{session.modules.map((m) => m.compatibility.coreApi).join(', ')}</dd>
          <dt>Scenarios enregistres</dt>
          <dd>{session.registry.ids().join(', ')}</dd>
        </dl>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Capacites de rendu</h2>
        <dl className="kv">
          <dt>WebGPU</dt>
          <dd>{capabilities.webgpu ? 'disponible' : 'indisponible'}</dd>
          <dt>WebGL 2</dt>
          <dd>{capabilities.webgl2 ? 'disponible' : 'indisponible'}</dd>
          <dt>Renderer</dt>
          <dd>{capabilities.rendererName ?? 'non expose par le pilote'}</dd>
          <dt>Coeurs logiques</dt>
          <dd>{capabilities.cores ?? 'non expose'}</dd>
          <dt>Memoire annoncee</dt>
          <dd>{capabilities.deviceMemoryGb === undefined ? 'non exposee' : `${capabilities.deviceMemoryGb} Go`}</dd>
          <dt>Profil retenu</dt>
          <dd>
            {session.profile.quality}, x{session.profile.pixelRatio}, cible {session.profile.targetFps} img/s
          </dd>
          <dt>Animations reduites</dt>
          <dd>{capabilities.prefersReducedMotion ? 'demandees par le systeme' : 'non demandees'}</dd>
        </dl>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Stockage et session</h2>
        <dl className="kv">
          <dt>Support</dt>
          <dd>{session.storageMode}</dd>
          <dt>Service worker</dt>
          <dd>{swState}</dd>
          <dt>Derniere sauvegarde</dt>
          <dd>
            {session.lastSavedAt === undefined
              ? 'aucune'
              : new Date(session.lastSavedAt).toLocaleString('fr-FR')}
          </dd>
          <dt>Instantanes</dt>
          <dd>{session.snapshots.length}</dd>
          <dt>Empreinte du monde</dt>
          <dd>{session.worldFingerprint()}</dd>
        </dl>
        <table className="neo-table" style={{ marginTop: 'var(--neo-space-3)' }}>
          <thead>
            <tr>
              <th>Magasin</th>
              <th>Taille</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(storage).map(([name, size]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="neo-muted">{Math.round(size / 1024)} Ko</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Sante de la simulation</h2>
        {session.world ? (
          <dl className="kv">
            <dt>Scenario</dt>
            <dd>{session.world.state.scenarioId}</dd>
            <dt>Graine</dt>
            <dd>{session.world.state.seed}</dd>
            <dt>Temps simule</dt>
            <dd>{Math.round(session.world.state.simTime / 1000)} s</dd>
            <dt>Equipements</dt>
            <dd>{session.world.state.network.nodes.length}</dd>
            <dt>Liens</dt>
            <dd>{session.world.state.network.links.length}</dd>
            <dt>Systemes instrumentes</dt>
            <dd>{session.world.state.systems.length}</dd>
            <dt>Evenements journalises</dt>
            <dd>{session.world.bus.all().length}</dd>
            <dt>Alertes actives</dt>
            <dd>{session.world.monitoring.activeAlerts().length}</dd>
          </dl>
        ) : (
          <p className="neo-muted">Aucun monde charge.</p>
        )}
      </section>
    </div>
  );
}
