import { useCallback, useEffect, useState } from 'react';
import {
  ACTIONS,
  bindingsDe,
  conflit,
  nomDeTouche,
  PRESETS,
  toucheAcceptable,
  type ActionCampus,
  type Bindings,
} from '../state/controls.ts';
import { Drawer } from '../ui/index.tsx';
import { useSession } from '../state/hooks.ts';

const FAMILLES: { cle: 'deplacement' | 'regard' | 'action'; titre: string }[] = [
  { cle: 'deplacement', titre: 'Se deplacer' },
  { cle: 'regard', titre: 'Regarder' },
  { cle: 'action', titre: 'Agir' },
];

/**
 * Panneau des commandes.
 *
 * Les touches n etaient expliquees nulle part et ne pouvaient pas etre
 * changees ; la seule aide affichee decrivait meme des commandes qui
 * n existaient pas. Ce panneau s ouvre depuis le campus, sans passer par les
 * reglages, parce que c est la qu on se pose la question.
 */
export function PanneauCommandes({ onFermer }: { onFermer: () => void }): JSX.Element {
  const session = useSession();
  const bindings = bindingsDe(session.progress.preferences);
  const [enEcoute, setEnEcoute] = useState<ActionCampus | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const enregistrer = useCallback(
    (suivantes: Bindings): void => {
      void session.updatePreferences({ keybindings: suivantes });
    },
    [session],
  );

  useEffect(() => {
    if (enEcoute === undefined) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setEnEcoute(undefined);
        setMessage(undefined);
        return;
      }
      if (!toucheAcceptable(event.code)) {
        setMessage(`${nomDeTouche(event.code)} est reservee au navigateur.`);
        return;
      }
      const occupee = conflit(bindings, event.code, enEcoute);
      if (occupee !== undefined) {
        const libelle = ACTIONS.find((a) => a.action === occupee)?.libelle ?? occupee;
        setMessage(`${nomDeTouche(event.code)} est deja utilisee pour « ${libelle} ».`);
        return;
      }
      enregistrer({ ...bindings, [enEcoute]: event.code });
      setEnEcoute(undefined);
      setMessage(undefined);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enEcoute, bindings, enregistrer]);

  return (
    <Drawer titre="Commandes" onFermer={onFermer}>
      <p className="neo-muted" style={{ marginTop: 0 }}>
        Cliquez une touche pour la remplacer, puis appuyez sur la nouvelle. Echap annule.
      </p>

      <div className="commandes__presets">
        <button
          type="button"
          className="neo-btn neo-btn--sm"
          onClick={() => enregistrer(PRESETS.azerty)}
        >
          Disposition AZERTY
        </button>
        <button
          type="button"
          className="neo-btn neo-btn--sm"
          onClick={() => enregistrer(PRESETS.qwerty)}
        >
          Disposition QWERTY
        </button>
        <button
          type="button"
          className="neo-btn neo-btn--sm neo-btn--ghost"
          onClick={() => enregistrer(PRESETS.azerty)}
        >
          Reinitialiser les commandes
        </button>
      </div>

      {message === undefined ? null : (
        <p className="commandes__conflit" role="alert">
          {message}
        </p>
      )}

      {FAMILLES.map((famille) => (
        <section key={famille.cle} className="commandes__famille">
          <h3>{famille.titre}</h3>
          <ul className="commandes__liste">
            {ACTIONS.filter((action) => action.famille === famille.cle).map((action) => (
              <li key={action.action}>
                <span>{action.libelle}</span>
                <button
                  type="button"
                  className={
                    enEcoute === action.action
                      ? 'commandes__touche commandes__touche--ecoute'
                      : 'commandes__touche'
                  }
                  onClick={() => {
                    setEnEcoute(action.action);
                    setMessage(undefined);
                  }}
                  aria-label={`Changer la touche de ${action.libelle}`}
                >
                  {enEcoute === action.action
                    ? 'Appuyez sur une touche'
                    : nomDeTouche(bindings[action.action])}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="neo-dim" style={{ fontSize: 'var(--neo-fs-sm)' }}>
        La souris fait tourner la vue lorsqu on maintient le bouton enfonce. Echap ferme un outil
        ouvert.
      </p>
    </Drawer>
  );
}
