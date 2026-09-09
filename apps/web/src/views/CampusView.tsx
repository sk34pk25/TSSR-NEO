import { lazy, Suspense } from 'react';
import { zoneById } from '@tssr/rendering';
import { navigate, useSession } from '../state/hooks.ts';

// Le campus tridimensionnel embarque le moteur graphique : il est charge a la demande.
const Campus3D = lazy(() =>
  import('../components/Campus3D.tsx').then((module) => ({ default: module.Campus3D })),
);

/**
 * Campus NEO Systems : le lieu, et rien d autre.
 *
 * Le catalogue de cours vivait ici et repoussait la vue a six cents pixels du
 * haut de page ; le produit se lisait alors comme un site contenant une petite
 * vue 3D. Le catalogue a rejoint l espace d apprentissage : « ou suis-je ? » et
 * « qu est-ce que j apprends ? » sont deux questions distinctes.
 */
export function CampusView(): JSX.Element {
  const session = useSession();

  return (
    <div className="campus-view">
      <h1 className="neo-visually-hidden">Campus NEO Systems</h1>
      <Suspense
        fallback={
          <div className="neo-card" role="status">
            Preparation du campus...
          </div>
        }
      >
        <Campus3D
          profile={session.profile}
          reduceMotion={session.progress.preferences.accessibility.reduceMotion}
          developerMode={session.progress.preferences.developerMode}
          onAmbiance={(ambience) => session.setCampusAmbience(ambience)}
          highlightZoneIds={session.runner === undefined ? [] : ['training-lab']}
          onEnterZone={(zoneId) => {
            const zone = zoneById(zoneId);
            if (!zone) return;
            // Une zone qui exige une infrastructure la prepare avant d ouvrir l ecran.
            const needsWorld =
              zone.route === 'laboratoire' ||
              zone.route === 'supervision' ||
              zone.route === 'tickets';
            if (needsWorld && session.world === undefined) session.startFreeLab();
            navigate(zone.route);
          }}
        />
      </Suspense>
    </div>
  );
}
