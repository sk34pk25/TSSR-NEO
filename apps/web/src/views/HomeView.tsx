import { Meter } from '../components/Meter.tsx';
import { PrimaryAction } from '../ui/index.tsx';
import { navigate, useSession } from '../state/hooks.ts';
import { nextStep } from '../state/next-step.ts';

/**
 * Accueil.
 *
 * Il repond a trois questions dans cet ordre : ou en suis-je, que dois-je faire
 * maintenant, et ou puis-je aller sinon. L ancienne version proposait trois
 * actions de meme poids sans dire laquelle choisir, puis consacrait sa moitie
 * basse a decrire le moteur de simulation ; cet argumentaire technique vit
 * desormais dans « A propos », ou il s adresse a qui le cherche.
 */
export function HomeView(): JSX.Element {
  const session = useSession();
  const etape = nextStep(session);
  const progress = session.progress;
  const terminees = progress.missions.filter((m) => m.completed).length;
  const prenom = progress.displayName;

  /*
   * Ce qui justifie l action est deduit du cours reellement charge : la
   * competence visee par la prochaine etape, et la duree annoncee. Rien n est
   * invente ; quand l information n existe pas, on le dit.
   */
  const cours = session.courses[0];
  const prochaineMission = session.missions.find(
    (mission) => !progress.missions.some((m) => m.missionId === mission.id && m.completed),
  );
  const prochaineCompetence = prochaineMission?.competencies[0] ?? 'a determiner';
  const tempsEstime =
    cours === undefined ? 'non renseigne' : `environ ${Math.round(cours.estimatedHours * 60)} min`;

  return (
    <div className="accueil">
      {session.recovery !== undefined ? (
        <div className="banner banner--warning" role="alert">
          <div className="neo-grow">
            <strong>Session precedente interrompue</strong>
            <p className="neo-muted" style={{ margin: '4px 0 0', fontSize: 'var(--neo-fs-sm)' }}>
              Un etat coherent a ete retrouve
              {session.recovery.source === 'checkpoint'
                ? ' (dernier point de controle sain)'
                : ' (sauvegarde automatique)'}
              . Vous pouvez reprendre exactement ou vous en etiez.
            </p>
          </div>
          <div className="neo-row">
            <button
              type="button"
              className="neo-btn neo-btn--primary neo-btn--sm"
              onClick={() => {
                if (session.recovery) {
                  session.restore(session.recovery.save);
                  navigate('mission');
                }
              }}
            >
              Reprendre
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--sm"
              onClick={() => void session.dismissRecovery()}
            >
              Ignorer
            </button>
          </div>
        </div>
      ) : null}

      <h1 className="neo-visually-hidden">Apprendre le metier, pas seulement les commandes</h1>

      {/*
       * Une seule action mise en avant, et la raison qui la justifie. La raison
       * est deduite de l etat reel : elle change quand l etat change.
       */}
      <section className="accueil__suite" data-ton={etape.ton}>
        <p className="accueil__salutation">
          Bonjour {prenom}. Vous etes technicien systemes et reseaux chez NEO Systems.
        </p>
        <h2 className="accueil__titre">{etape.titre}</h2>
        <PrimaryAction
          libelle={etape.action}
          raison={etape.raison}
          onClick={() => {
            const destination = etape.executer(session);
            if (destination) navigate(destination);
          }}
          secondaire={{ libelle: 'Voir mon parcours', onClick: () => navigate('parcours') }}
          detail={
            <>
              <span>Prochaine competence : {prochaineCompetence}</span>
              <span>Temps estime : {tempsEstime}</span>
            </>
          }
        />
      </section>

      <section className="accueil__reperes">
        <button type="button" className="repere" onClick={() => navigate('campus')}>
          <strong>Aller au campus</strong>
          <span className="neo-muted">
            Les locaux de NEO Systems : accueil, bureaux, salle reseau, datacenter.
          </span>
        </button>
        <button
          type="button"
          className="repere"
          onClick={() => {
            if (session.world === undefined) session.startFreeLab();
            navigate('laboratoire');
          }}
        >
          <strong>Laboratoire libre</strong>
          <span className="neo-muted">
            Construire, casser et observer une infrastructure sans objectif impose.
          </span>
        </button>
        <button
          type="button"
          className="repere"
          onClick={() => navigate('parcours')}
        >
          <strong>Consulter les fiches</strong>
          <span className="neo-muted">
            La documentation de reference, consultable hors ligne et tolerante aux fautes.
          </span>
        </button>
      </section>

      <section className="accueil__etat">
        <h2>Ou vous en etes</h2>
        <div className="accueil__etat-grille">
          <div>
            <span className="neo-dim">Rang</span>
            <strong>{progress.careerRank}</strong>
          </div>
          <div>
            <span className="neo-dim">Niveau</span>
            <strong>{progress.level}</strong>
          </div>
          <div>
            <span className="neo-dim">Interventions terminees</span>
            <strong>
              {terminees} sur {session.missions.length}
            </strong>
          </div>
          <div>
            <span className="neo-dim">Competences suivies</span>
            <strong>{progress.competencies.length}</strong>
          </div>
        </div>
        {session.missions.length > 0 ? (
          <Meter
            label="Avancement du parcours"
            value={terminees / session.missions.length}
            valueText={`${terminees} intervention${terminees > 1 ? 's' : ''} sur ${session.missions.length}`}
          />
        ) : null}
        <p className="neo-dim" style={{ fontSize: 'var(--neo-fs-sm)', margin: 0 }}>
          Progression conservee sur cet appareil, sans compte. Les badges sont pedagogiques :
          TSSR NEO ne delivre aucune certification ni attestation.{' '}
          <a href="#/a-propos">Comment fonctionne la plateforme</a>
        </p>
      </section>
    </div>
  );
}
