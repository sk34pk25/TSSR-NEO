import { useMemo, useState } from 'react';
import { npcById, roleLibelle, type InteractiveSpec } from '@tssr/rendering';
import { TerminalPanel, terminalAdapter } from './TerminalPanel.tsx';
import { useSession, useSimValue } from '../state/hooks.ts';


/**
 * Conversation avec une personne du campus.
 *
 * Le dialogue enseigne le diagnostic humain : depuis quand, qu est-ce qui a
 * change, quel message exact. Aucune reponse ne donne la cause ; elles donnent
 * des symptomes, que le joueur doit relier lui-meme. NOVA n a pas a remplacer
 * cette etape : demander a un utilisateur ce qu il constate fait partie du
 * metier.
 */
function Dialogue({ npcId }: { npcId: string }): JSX.Element {
  const npc = npcById(npcId);
  const [posees, setPosees] = useState<readonly number[]>([]);

  if (!npc) {
    return <p className="neo-muted">Cette personne n est pas disponible.</p>;
  }

  return (
    <div className="dialogue">
      <p className="dialogue__role">{roleLibelle(npc.role)}</p>
      <p className="dialogue__replique">{npc.dialogue.ouverture}</p>

      {posees.map((index) => {
        const echange = npc.dialogue.questions[index];
        if (!echange) return null;
        return (
          <div key={index} className="dialogue__echange">
            <p className="dialogue__question">{echange.question}</p>
            <p className="dialogue__replique">{echange.reponse}</p>
          </div>
        );
      })}

      <div className="dialogue__choix">
        {npc.dialogue.questions.map((echange, index) =>
          posees.includes(index) ? null : (
            <button
              key={echange.question}
              type="button"
              className="neo-btn neo-btn--sm"
              onClick={() => setPosees([...posees, index])}
            >
              {echange.question}
            </button>
          ),
        )}
        {posees.length === npc.dialogue.questions.length ? (
          <span className="neo-dim">Vous avez fait le tour de ce qu il ou elle peut vous dire.</span>
        ) : null}
      </div>
    </div>
  );
}

interface CampusInteractionProps {
  interaction: InteractiveSpec;
  onFermer: () => void;
}

/**
 * Outil ouvert sur place, dans le campus.
 *
 * Franchir une porte basculait systematiquement vers un ecran classique : le
 * campus n etait donc jamais un lieu de travail, seulement un vestibule. Ce
 * panneau ouvre le vrai outil par-dessus la vue, et se referme sans avoir
 * quitte les lieux.
 *
 * Rien n est simule deux fois : le terminal est le terminal du moteur, la baie
 * montre l etat reel des equipements. Quand aucune infrastructure n est
 * chargee, le panneau le dit et propose d en demarrer une, plutot que
 * d afficher un decor vide.
 */
export function CampusInteraction({ interaction, onFermer }: CampusInteractionProps): JSX.Element {
  const session = useSession();
  const [version, setVersion] = useState(0);
  const world = session.world;

  /*
   * Le monde simule est mute en place : son identite ne change jamais, donc la
   * memorisation standard ne peut pas savoir qu il faut recalculer. Le numero
   * de version joue ce role, comme partout ailleurs dans l application.
   */
  const machines = useSimValue(version, () => world?.state.systems ?? []);
  const [machineChoisie, setMachineChoisie] = useState('');
  const machineId = machineChoisie !== '' ? machineChoisie : (machines[0]?.id ?? '');

  const terminal = useMemo(() => {
    if (!world || machineId === '') return undefined;
    const cree = world.terminal(machineId);
    return cree ? terminalAdapter(cree) : undefined;
  }, [world, machineId]);

  const equipements = useSimValue(version, () =>
    (world?.state.network.nodes ?? []).filter(
      (node) => node.kind === 'switch' || node.kind === 'router' || node.kind === 'firewall',
    ),
  );

  return (
    <div className="interaction" role="dialog" aria-label={interaction.label}>
      <div className="interaction__entete">
        <div>
          <strong>{interaction.label}</strong>
          {interaction.description === undefined ? null : (
            <span className="neo-muted"> — {interaction.description}</span>
          )}
        </div>
        <button type="button" className="neo-btn neo-btn--sm neo-btn--ghost" onClick={onFermer}>
          Fermer (Echap)
        </button>
      </div>

      <div className="interaction__corps">
        {interaction.kind === 'npc' ? (
          <Dialogue npcId={interaction.targetId} />
        ) : world === undefined ? (
          <div className="neo-card">
            <h3 style={{ marginTop: 0 }}>Aucune infrastructure chargee</h3>
            <p className="neo-muted">
              Ce poste existe, mais il n est relie a aucune infrastructure pour l instant. Demarrez
              le laboratoire libre pour en instancier une, ou lancez une intervention depuis
              l accueil.
            </p>
            <button
              type="button"
              className="neo-btn neo-btn--primary"
              onClick={() => {
                session.startFreeLab();
                setVersion((v) => v + 1);
              }}
            >
              Demarrer le laboratoire libre
            </button>
          </div>
        ) : interaction.kind === 'workstation' ? (
          <>
            <label className="neo-row" style={{ gap: 8, marginBottom: 8 }}>
              <span className="neo-muted">Machine</span>
              <select
                className="neo-select"
                style={{ width: 'auto' }}
                value={machineId}
                onChange={(event) => setMachineChoisie(event.target.value)}
                aria-label="Machine cible du terminal"
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.hostname} ({machine.os})
                  </option>
                ))}
              </select>
            </label>
            {terminal ? (
              <TerminalPanel
                key={machineId}
                console={terminal}
                title={machines.find((m) => m.id === machineId)?.hostname ?? 'terminal'}
                intro={'Terminal simule. Tapez "aide" pour la liste exacte des commandes.'}
                onCommand={() => {
                  session.tick();
                  setVersion((v) => v + 1);
                }}
              />
            ) : (
              <p className="neo-muted">Aucune machine accessible depuis ce poste.</p>
            )}
          </>
        ) : (
          <div className="neo-scroll">
            {equipements.length === 0 ? (
              <p className="neo-muted">Cette baie ne contient aucun equipement actif.</p>
            ) : (
              <table className="neo-table">
                <caption className="neo-visually-hidden">
                  Equipements montes dans la baie, avec l etat reel de leurs interfaces
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Equipement</th>
                    <th scope="col">Type</th>
                    <th scope="col">Interfaces activees</th>
                  </tr>
                </thead>
                <tbody>
                  {equipements.map((equipement) => {
                    const actives = equipement.interfaces.filter((face) => face.enabled).length;
                    return (
                      <tr key={equipement.id}>
                        <th scope="row">{equipement.hostname}</th>
                        <td>{equipement.kind}</td>
                        <td>
                          {actives} sur {equipement.interfaces.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="neo-dim" style={{ fontSize: 'var(--neo-fs-sm)' }}>
              Ces valeurs sont lues sur l etat simule au moment de l ouverture. Le brassage physique
              et les temoins lumineux se manipulent dans la vue materielle d une intervention.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
