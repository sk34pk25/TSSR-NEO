import { checkPrerequisites, planReviewSession } from '@tssr/progression';
import type { AppSession } from './session.ts';
import type { RouteName } from './hooks.ts';

export interface NextStep {
  /** Ce que NOVA propose, formule a la deuxieme personne. */
  titre: string;
  /** Pourquoi cette proposition, deduite de l etat reel et jamais inventee. */
  raison: string;
  /** Libelle du bouton principal. */
  action: string;
  /** Ce que declenche le bouton. */
  executer: (session: AppSession) => RouteName | undefined;
  /** Sert au suivi visuel : une reprise ne se presente pas comme un depart. */
  ton: 'reprise' | 'depart' | 'revision' | 'libre';
}

/**
 * Prochaine etape recommandee.
 *
 * Chaque branche est deduite de l etat reel du profil et du deroulement en
 * cours. Aucune recommandation n est fabriquee : quand rien ne peut etre
 * recommande honnetement, la derniere branche propose la seule chose toujours
 * vraie, c est-a-dire manipuler librement.
 */
export function nextStep(session: AppSession, now = Date.now()): NextStep {
  const runner = session.runner;
  const statut = runner?.state.status;

  if (runner && (statut === 'active' || statut === 'briefing')) {
    const resume = runner.summary();
    const titre = typeof resume.title === 'string' ? resume.title : 'la mission en cours';
    const total = runner.state.objectives.length;
    const faits = runner.state.objectives.filter(
      (objectif) => objectif.status === 'completed',
    ).length;
    return {
      titre: `Reprendre : ${titre}`,
      raison:
        total > 0
          ? `Vous en etes a ${faits} objectif${faits > 1 ? 's' : ''} sur ${total}.`
          : 'Une intervention est ouverte et vous attend.',
      action: 'Reprendre',
      executer: () => 'mission',
      ton: 'reprise',
    };
  }

  // Une notion arrivee a echeance passe avant une nouvelle mission : c est le
  // principe meme de la repetition espacee.
  const dues = planReviewSession(session.progress, 10, now).filter(
    (entree) => entree.reason === 'due',
  );
  if (dues.length > 0) {
    return {
      titre: `Reviser ${dues.length} notion${dues.length > 1 ? 's' : ''}`,
      raison:
        dues.length > 1
          ? 'Ces notions arrivent a echeance de revision : les revoir maintenant coute quelques minutes.'
          : 'Cette notion arrive a echeance de revision : la revoir maintenant coute quelques minutes.',
      action: 'Ouvrir la revision',
      executer: () => 'apprendre',
      ton: 'revision',
    };
  }

  const suivante = session.missions.find((mission) => {
    const releve = session.progress.missions.find((m) => m.missionId === mission.id);
    if (releve?.completed === true) return false;
    return checkPrerequisites(session.progress, mission.prerequisites).satisfied;
  });

  if (suivante) {
    const titre = typeof suivante.title === 'string' ? suivante.title : suivante.id;
    const dejaTentee = session.progress.missions.some((m) => m.missionId === suivante.id);
    return {
      titre: dejaTentee ? `Reprendre : ${titre}` : `Commencer : ${titre}`,
      raison: dejaTentee
        ? 'Vous avez deja ouvert cette intervention sans la terminer.'
        : 'C est la prochaine intervention pour laquelle vous avez les prerequis.',
      action: dejaTentee ? 'Reprendre' : 'Commencer',
      executer: (courante) => {
        courante.startMission(suivante.id);
        return 'mission';
      },
      ton: dejaTentee ? 'reprise' : 'depart',
    };
  }

  return {
    titre: 'Ouvrir le laboratoire libre',
    raison:
      session.missions.length === 0
        ? 'Aucun cours n est installe dans cette version : le laboratoire reste le moyen de manipuler une vraie infrastructure.'
        : 'Toutes les interventions disponibles sont terminees. Le laboratoire permet de construire, casser et observer sans objectif impose.',
    action: 'Ouvrir le laboratoire',
    executer: (courante) => {
      if (courante.world === undefined) courante.startFreeLab();
      return 'laboratoire';
    },
    ton: 'libre',
  };
}
