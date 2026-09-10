import { useMemo, useState } from 'react';
import type { CourseManifest, KnowledgeEntry } from '@tssr/contracts';
import { checkPrerequisites, isDue } from '@tssr/progression';
import { Drawer, EmptyState, PageHeader, Section, StatusChip, type Etat } from '../ui/index.tsx';
import { Meter } from '../components/Meter.tsx';
import { navigate, useSession } from '../state/hooks.ts';

type Nature = 'notion' | 'intervention' | 'revision';

interface Etape {
  cle: string;
  nature: Nature;
  titre: string;
  texte: string;
  etat: Etat;
  competences: string[];
  action?: { libelle: string; executer: () => void };
  /** Fiche a ouvrir dans le tiroir, quand l etape en designe une. */
  fiche?: KnowledgeEntry;
}

const NATURE_LIBELLE: Record<Nature, string> = {
  notion: 'Notion',
  intervention: 'Intervention',
  revision: 'Revision',
};

function texteDe(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

/**
 * Parcours TSSR.
 *
 * Quatre destinations distinctes demandaient a l apprenant de savoir lui-meme
 * s il devait consulter une fiche, lancer une intervention, reviser ou
 * regarder son releve de competences. C etait a lui de faire le travail
 * d orchestration. Le parcours le fait desormais : une seule colonne ordonnee,
 * ou chaque etape sait ce qu elle est, ou elle en est, et ce qu il reste a
 * faire. Les fiches s ouvrent sur place, sans changer d ecran.
 */
export function ParcoursView(): JSX.Element {
  const session = useSession();
  const [ficheOuverte, setFicheOuverte] = useState<KnowledgeEntry | undefined>(undefined);

  const cours: CourseManifest | undefined = session.courses[0];

  const etapes = useMemo<Etape[]>(() => {
    if (!cours) return [];
    const maintenant = Date.now();
    const liste: Etape[] = [];

    cours.path.forEach((pas, index) => {
      if (pas.kind === 'knowledge') {
        const fiche = session.library.entry(pas.entryId);
        const vue = session.progress.competencies.some((c) =>
          (fiche?.competencies ?? []).includes(c.competencyId),
        );
        liste.push({
          cle: `notion-${index}`,
          nature: 'notion',
          titre: texteDe(fiche?.title, pas.entryId),
          texte: texteDe(fiche?.summary, 'Fiche de reference a lire avant d intervenir.'),
          etat: vue ? 'acquis' : 'neutre',
          competences: fiche?.competencies ?? [],
          ...(fiche === undefined
            ? {}
            : {
                fiche,
                action: { libelle: 'Lire la fiche', executer: () => setFicheOuverte(fiche) },
              }),
        });
        return;
      }

      if (pas.kind === 'mission') {
        const mission = session.mission(pas.missionId);
        const releve = session.progress.missions.find((m) => m.missionId === pas.missionId);
        const prerequis = mission
          ? checkPrerequisites(session.progress, mission.prerequisites)
          : { satisfied: true, blocking: [], advisory: [] };
        const enCours =
          session.runner?.definition.id === pas.missionId &&
          (session.runner.state.status === 'active' || session.runner.state.status === 'briefing');
        const etat: Etat = releve?.completed === true
          ? 'acquis'
          : enCours
            ? 'encours'
            : prerequis.satisfied
              ? 'neutre'
              : 'bloque';
        liste.push({
          cle: `mission-${index}`,
          nature: 'intervention',
          titre: texteDe(mission?.title, pas.missionId),
          texte: texteDe(
            mission?.briefing,
            'Une situation reelle a diagnostiquer, corriger et documenter.',
          ),
          etat,
          competences: mission?.competencies ?? [],
          ...(mission === undefined || !prerequis.satisfied
            ? {}
            : {
                action: {
                  libelle: enCours ? 'Reprendre' : releve?.completed === true ? 'Refaire' : 'Commencer',
                  executer: () => {
                    if (!enCours) session.startMission(mission.id);
                    navigate('mission');
                  },
                },
              }),
        });
        return;
      }

      // Une revision n a de sens que si quelque chose est reellement du.
      const dues = session.progress.competencies.filter(
        (c) => pas.competencyIds.includes(c.competencyId) && isDue(c, maintenant),
      );
      const jamaisTravaillee = session.progress.competencies.every(
        (c) => !pas.competencyIds.includes(c.competencyId),
      );
      liste.push({
        cle: `revision-${index}`,
        nature: 'revision',
        titre: `Ancrer ${pas.competencyIds.length} notion${pas.competencyIds.length > 1 ? 's' : ''}`,
        texte: jamaisTravaillee
          ? 'Disponible une fois l intervention terminee : les questions viennent de ce que vous aurez travaille.'
          : dues.length > 0
            ? `${dues.length} notion${dues.length > 1 ? 's arrivent' : ' arrive'} a echeance de revision.`
            : 'Rien n est du pour l instant. Cette etape reviendra d elle-meme.',
        etat: jamaisTravaillee ? 'bloque' : dues.length > 0 ? 'attention' : 'acquis',
        competences: pas.competencyIds,
        ...(jamaisTravaillee
          ? {}
          : {
              action: {
                libelle: 'Demarrer la revision',
                executer: () => navigate('revision'),
              },
            }),
      });
    });
    return liste;
  }, [cours, session]);

  if (!cours) {
    return (
      <>
        <PageHeader
          titre="Parcours"
          chapeau="Ce que vous apprenez, dans l ordre, et ou vous en etes."
        />
        <EmptyState
          titre="Aucun parcours installe"
          explication="Cette version ne contient pas encore de cours. Le laboratoire libre reste ouvert : vous y manipulez une vraie infrastructure, sans objectif impose."
          action={{
            libelle: 'Ouvrir le laboratoire libre',
            onClick: () => {
              session.startFreeLab();
              navigate('laboratoire');
            },
          }}
        />
      </>
    );
  }

  const faites = etapes.filter((e) => e.etat === 'acquis').length;
  const maitrises = session.progress.competencies;

  return (
    <>
      <PageHeader
        titre="Parcours"
        chapeau={texteDe(cours.summary)}
        aside={
          <StatusChip
            etat={faites === etapes.length ? 'acquis' : 'encours'}
            libelle={`${faites} etape${faites > 1 ? 's' : ''} sur ${etapes.length}`}
          />
        }
      >
        <Meter
          label="Avancement du parcours"
          value={etapes.length === 0 ? 0 : faites / etapes.length}
          valueText={`${faites} etape${faites > 1 ? 's' : ''} sur ${etapes.length}`}
        />
      </PageHeader>

      <ol className="parcours">
        {etapes.map((etape, index) => (
          <li key={etape.cle} className="parcours__etape" data-etat={etape.etat}>
            <span className="parcours__pastille" aria-hidden="true">
              {etape.etat === 'acquis' ? '✓' : index + 1}
            </span>
            <div className="parcours__corps">
              <div className="parcours__ligne">
                <span className="parcours__nature">{NATURE_LIBELLE[etape.nature]}</span>
                {etape.etat === 'neutre' ? null : <StatusChip etat={etape.etat} />}
              </div>
              <h3 className="parcours__titre">{etape.titre}</h3>
              <p className="parcours__texte">{etape.texte}</p>
              {etape.competences.length === 0 ? null : (
                <div className="parcours__competences">
                  {etape.competences.map((id) => {
                    const maitrise = maitrises.find((m) => m.competencyId === id);
                    return (
                      <StatusChip
                        key={id}
                        etat={
                          maitrise === undefined
                            ? 'neutre'
                            : maitrise.mastery > 0.7
                              ? 'acquis'
                              : 'attention'
                        }
                        libelle={
                          maitrise === undefined
                            ? id
                            : `${id} · ${Math.round(maitrise.mastery * 100)} %`
                        }
                      />
                    );
                  })}
                </div>
              )}
              {etape.action === undefined ? null : (
                <div className="parcours__actions">
                  <button
                    type="button"
                    className={
                      etape.etat === 'encours' || etape.etat === 'attention'
                        ? 'neo-btn neo-btn--primary neo-btn--sm'
                        : 'neo-btn neo-btn--sm'
                    }
                    onClick={etape.action.executer}
                  >
                    {etape.action.libelle}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <Section
        titre="Manipuler librement"
        aside={
          <button
            type="button"
            className="neo-btn neo-btn--sm"
            onClick={() => {
              if (session.world === undefined) session.startFreeLab();
              navigate('laboratoire');
            }}
          >
            Ouvrir le laboratoire
          </button>
        }
      >
        <p className="parcours__texte">
          Hors parcours, le laboratoire met a disposition la meme infrastructure sans objectif
          impose : construire, casser, observer, recommencer.
        </p>
      </Section>

      {ficheOuverte === undefined ? null : (
        <Drawer
          titre={texteDe(ficheOuverte.title, 'Fiche')}
          onFermer={() => setFicheOuverte(undefined)}
        >
          <p className="parcours__texte">{texteDe(ficheOuverte.summary)}</p>
          <div className="ui-drawer__texte">{texteDe(ficheOuverte.body)}</div>
          {ficheOuverte.command === undefined ? null : (
            <div className="ui-drawer__commande">
              <strong>Syntaxe</strong>
              <code className="neo-mono">{ficheOuverte.command.syntax}</code>
            </div>
          )}
        </Drawer>
      )}
    </>
  );
}
