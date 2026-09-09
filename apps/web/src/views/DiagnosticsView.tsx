import { useEffect, useState } from 'react';
import { CORE_VERSION } from '../state/session.ts';
import { useSession } from '../state/hooks.ts';
import { recoverFromCorruptedCache, serviceWorkerStatus } from '../state/pwa.ts';
import type { Role } from '@tssr/contracts';

declare const __TSSR_BUILD__: string;
/**
 * NEO Diagnostics.
 * Etat technique reel de l application. Aucun secret n y est expose.
 */
export function DiagnosticsView(): JSX.Element {
  const session = useSession();
  const [storage, setStorage] = useState<Record<string, number>>({});
  const [bootstrapMessage, setBootstrapMessage] = useState<string | undefined>(undefined);
  const [sw, setSw] = useState<{
    state: string;
    scope: string | undefined;
    caches: string[];
    precached: number;
  }>({ state: 'non evalue', scope: undefined, caches: [], precached: 0 });

  useEffect(() => {
    void session.storageReport().then((report) => setStorage(report.byStore));
    void serviceWorkerStatus().then(setSw);
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
          <dd>
            {capabilities.deviceMemoryGb === undefined
              ? 'non exposee'
              : `${capabilities.deviceMemoryGb} Go`}
          </dd>
          <dt>Profil retenu</dt>
          <dd>
            {session.profile.quality}, x{session.profile.pixelRatio}, cible{' '}
            {session.profile.targetFps} img/s
          </dd>
          <dt>Animations reduites</dt>
          <dd>
            {capabilities.prefersReducedMotion ? 'demandees par le systeme' : 'non demandees'}
          </dd>
        </dl>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Stockage et session</h2>
        <dl className="kv">
          <dt>Support</dt>
          <dd>{session.storageMode}</dd>
          <dt>Service worker</dt>
          <dd>{sw.state}</dd>
          <dt>Portee du service worker</dt>
          <dd>{sw.scope ?? 'aucune'}</dd>
          <dt>Ressources en cache</dt>
          <dd>{sw.precached}</dd>
          <dt>Versions de cache</dt>
          <dd>{sw.caches.join(', ') || 'aucune'}</dd>
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

        <div className="neo-row" style={{ marginTop: 'var(--neo-space-4)' }}>
          <button
            type="button"
            className="neo-btn neo-btn--sm neo-btn--danger"
            onClick={() => void recoverFromCorruptedCache()}
          >
            Vider le cache et recharger
          </button>
          <span className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)' }}>
            Recuperation apres cache corrompu. La progression est stockee separement et n est pas
            affectee.
          </span>
        </div>
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Roles et autorisations</h2>
        <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
          Ces verifications servent a ne pas proposer une action impossible. Elles ne remplacent
          jamais un controle cote service : lorsqu un service distant sera branche, il reevaluera
          exactement les memes regles.
        </p>
        <div className="neo-field" style={{ maxWidth: 280 }}>
          <label htmlFor="role">Role local</label>
          <select
            id="role"
            className="neo-select"
            value={session.role}
            onChange={(event) => session.setRole(event.target.value as Role)}
          >
            <option value="guest">Invite</option>
            <option value="student">Apprenant</option>
            <option value="trainer">Formateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <dl className="kv" style={{ marginTop: 'var(--neo-space-3)' }}>
          <dt>Permissions effectives</dt>
          <dd>{session.policy.effectivePermissions(session.subject()).length}</dd>
          <dt>Prise de controle initiale</dt>
          <dd>{session.bootstrap.locked ? 'verrouillee' : 'disponible'}</dd>
        </dl>
        <button
          type="button"
          className="neo-btn neo-btn--sm"
          disabled={session.bootstrap.locked}
          onClick={() => {
            const result = session.claimAdministrator();
            setBootstrapMessage(result.reason);
          }}
        >
          Revendiquer le role administrateur
        </button>
        {bootstrapMessage !== undefined ? (
          <p className="neo-tag neo-tag--accent" style={{ marginTop: 'var(--neo-space-3)' }}>
            {bootstrapMessage}
          </p>
        ) : null}
      </section>

      <section className="neo-card">
        <h2 style={{ fontSize: 'var(--neo-fs-lg)' }}>Synchronisation et audio</h2>
        <dl className="kv">
          <dt>Etat de synchronisation</dt>
          <dd>{session.syncState.status}</dd>
          <dt>Operations en file</dt>
          <dd>{session.syncState.pending}</dd>
          <dt>Derniere erreur</dt>
          <dd>{session.syncState.lastError ?? 'aucune'}</dd>
          <dt>Service distant</dt>
          <dd>aucun configure : la file attend sans perte</dd>
          <dt>Etat audio</dt>
          <dd>{session.audioStatus}</dd>
        </dl>
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
