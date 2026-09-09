import { useState } from 'react';
import type { Ticket } from '@tssr/contracts';
import type { MissionRunner } from '@tssr/mission-engine';
import type { Nova, NovaMessage } from '@tssr/nova';
import type { SimulationWorld } from '@tssr/sim-world';
import { Meter } from './Meter.tsx';
import { useSimValue } from '../state/hooks.ts';

interface ObjectivesPanelProps {
  runner: MissionRunner;
  version: number;
}

/** Objectifs reevalues en continu contre l etat reel : jamais coches a la main. */
export function ObjectivesPanel({ runner, version }: ObjectivesPanelProps): JSX.Element {
  const objectives = useSimValue(version, () => runner.objectives());
  const done = objectives.filter((o) => o.status === 'completed').length;

  return (
    <div className="neo-panel">
      <div className="neo-panel__head">
        <span>Objectifs</span>
        <span className="neo-tag neo-tag--accent">
          {done}/{objectives.length}
        </span>
      </div>
      <div className="neo-panel__body">
        <Meter
          value={done / Math.max(1, objectives.length)}
          label="Objectifs atteints"
          valueText={`${done} objectif(s) sur ${objectives.length}`}
        />
        <div style={{ marginTop: 'var(--neo-space-3)' }}>
          {objectives.map((objective) => (
            <div
              key={objective.id}
              className={`objective${objective.status === 'completed' ? ' objective--done' : ''}`}
            >
              <span className="objective__mark" aria-hidden="true">
                {objective.status === 'completed' ? 'OK' : ''}
              </span>
              <span>
                <span className="objective__label">{objective.label}</span>
                {objective.optional ? (
                  <span className="neo-tag" style={{ marginLeft: 6 }}>
                    optionnel
                  </span>
                ) : null}
                {objective.detail !== undefined && objective.status !== 'completed' ? (
                  <div className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)', marginTop: 3 }}>
                    {objective.detail}
                  </div>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {runner.state.status === 'failed' ? (
          <p className="neo-tag neo-tag--danger" style={{ marginTop: 'var(--neo-space-3)' }}>
            Mission en echec : {runner.state.failureReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface NovaPanelProps {
  nova: Nova;
  version: number;
  onAction: () => void;
}

/** NOVA : question d abord, pistes ensuite, solution seulement via un indice explicite. */
export function NovaPanel({ nova, version, onAction }: NovaPanelProps): JSX.Element {
  const [messages, setMessages] = useState<NovaMessage[]>([]);
  const [question, setQuestion] = useState('');
  const observations = useSimValue(version, () => nova.observations());

  function push(message: NovaMessage): void {
    setMessages((current) => [...current.slice(-9), message]);
    onAction();
  }

  return (
    <div className="neo-panel" style={{ height: '100%' }}>
      <div className="neo-panel__head">
        <span>NOVA</span>
        <span className="neo-dim" style={{ fontWeight: 400 }}>
          assistant pedagogique
        </span>
      </div>
      <div className="neo-panel__body neo-scroll">
        <div className="neo-stack">
          <div className="neo-row">
            <button
              type="button"
              className="neo-btn neo-btn--sm"
              onClick={() => push(nova.guidance())}
            >
              Par ou commencer ?
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--sm"
              onClick={() => push(nova.requestHint())}
            >
              Demander un indice
            </button>
          </div>

          {observations.map((observation) => (
            <div key={observation.id} className="nova-message nova-message--warning">
              {observation.text}
            </div>
          ))}

          {messages.length === 0 ? (
            <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
              Posez une question technique ou demandez une piste. Les indices consomment de l
              autonomie : ils sont comptes dans le bilan de fin de mission.
            </p>
          ) : null}

          {messages.map((message) => (
            <div key={message.id} className={`nova-message nova-message--${message.tone}`}>
              <div>{message.text}</div>
              {message.checks.length > 0 ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {message.checks.map((check) => (
                    <li key={check} className="neo-muted" style={{ fontSize: 'var(--neo-fs-xs)' }}>
                      {check}
                    </li>
                  ))}
                </ul>
              ) : null}
              {message.knowledgeEntryIds.length > 0 ? (
                <div className="neo-row" style={{ marginTop: 8, gap: 6 }}>
                  {message.knowledgeEntryIds.map((id) => (
                    <a key={id} className="neo-tag neo-tag--accent" href={`#/connaissances/${id}`}>
                      fiche {id}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <form
            className="neo-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (question.trim() === '') return;
              push(nova.answer(question));
              setQuestion('');
            }}
          >
            <input
              className="neo-input neo-grow"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Poser une question a NOVA"
              aria-label="Poser une question a NOVA"
            />
            <button type="submit" className="neo-btn neo-btn--sm">
              Envoyer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

interface TicketsPanelProps {
  world: SimulationWorld;
  version: number;
  onChange: () => void;
}

const STATUS_LABEL: Record<Ticket['status'], string> = {
  new: 'nouveau',
  assigned: 'affecte',
  'in-progress': 'en cours',
  'pending-user': 'attente utilisateur',
  'pending-change': 'attente changement',
  resolved: 'resolu',
  closed: 'clos',
  cancelled: 'annule',
};

/** Tickets relies a l etat technique : resoudre suppose avoir vraiment corrige. */
export function TicketsPanel({ world, version, onChange }: TicketsPanelProps): JSX.Element {
  const tickets = useSimValue(version, () => [...world.itsm.tickets]);
  const [openId, setOpenId] = useState<string | undefined>(tickets[0]?.id);
  const [summary, setSummary] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [comment, setComment] = useState('');
  const ticket = tickets.find((t) => t.id === openId);
  const sla = ticket ? world.itsm.sla(ticket.id) : undefined;

  return (
    <div className="neo-panel" style={{ height: '100%' }}>
      <div className="neo-panel__head">
        <span>Tickets</span>
        <span className="neo-dim" style={{ fontWeight: 400 }}>
          {tickets.length} au total
        </span>
      </div>
      <div className="neo-panel__body neo-scroll">
        <div className="neo-stack">
          {tickets.map((item) => (
            <button
              key={item.id}
              type="button"
              className="course-card"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setOpenId(item.id === openId ? undefined : item.id)}
            >
              <div className="neo-row" style={{ justifyContent: 'space-between' }}>
                <strong className="neo-mono">{item.reference}</strong>
                <span
                  className={`neo-tag ${item.priority === 'P1' ? 'neo-tag--danger' : item.priority === 'P2' ? 'neo-tag--warn' : ''}`}
                >
                  {item.priority}
                </span>
              </div>
              <div>{item.title}</div>
              <div className="neo-row" style={{ gap: 6 }}>
                <span className="neo-tag">{STATUS_LABEL[item.status]}</span>
                <span className="neo-tag">impact {item.impact}</span>
                <span className="neo-tag">urgence {item.urgency}</span>
              </div>
            </button>
          ))}

          {ticket ? (
            <div className="neo-card" style={{ padding: 'var(--neo-space-4)' }}>
              <h3>{ticket.title}</h3>
              <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                {ticket.description}
              </p>
              {sla ? (
                <p className={sla.breached ? 'neo-tag neo-tag--danger' : 'neo-tag'}>
                  Delai : {sla.elapsedMinutes} / {sla.slaMinutes} min
                  {sla.breached ? ' (depasse)' : ''}
                </p>
              ) : null}

              {ticket.comments.length > 0 ? (
                <div className="neo-stack" style={{ margin: 'var(--neo-space-3) 0' }}>
                  {ticket.comments.map((entry) => (
                    <div key={entry.id} className="nova-message">
                      <strong style={{ fontSize: 'var(--neo-fs-xs)' }}>{entry.author}</strong>
                      <div>{entry.body}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {ticket.status === 'resolved' || ticket.status === 'closed' ? (
                <div className="neo-stack">
                  <span className="neo-tag neo-tag--ok">Resolution enregistree</span>
                  <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                    {ticket.resolutionSummary}
                  </p>
                  {ticket.rootCause !== undefined ? (
                    <p className="neo-muted" style={{ fontSize: 'var(--neo-fs-sm)' }}>
                      Cause racine : {ticket.rootCause}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="neo-stack">
                  <div className="neo-field">
                    <label htmlFor="ticket-comment">Ajouter un commentaire</label>
                    <textarea
                      id="ticket-comment"
                      className="neo-textarea"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      style={{ minHeight: 60 }}
                    />
                  </div>
                  <button
                    type="button"
                    className="neo-btn neo-btn--sm"
                    disabled={comment.trim().length < 5}
                    onClick={() => {
                      world.itsm.comment(ticket.id, { author: 'technicien', body: comment.trim() });
                      setComment('');
                      onChange();
                    }}
                  >
                    Commenter
                  </button>

                  <div className="neo-field">
                    <label htmlFor="ticket-summary">Resolution appliquee</label>
                    <textarea
                      id="ticket-summary"
                      className="neo-textarea"
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      placeholder="Ce qui a ete constate, ce qui a ete fait, et la verification effectuee."
                    />
                  </div>
                  <div className="neo-field">
                    <label htmlFor="ticket-cause">Cause racine</label>
                    <textarea
                      id="ticket-cause"
                      className="neo-textarea"
                      value={rootCause}
                      onChange={(event) => setRootCause(event.target.value)}
                      style={{ minHeight: 60 }}
                      placeholder="Pourquoi la panne est survenue, pour eviter la recidive."
                    />
                  </div>
                  <button
                    type="button"
                    className="neo-btn neo-btn--primary"
                    disabled={summary.trim().length < 20}
                    onClick={() => {
                      world.itsm.resolve(ticket.id, summary.trim(), rootCause.trim() || undefined);
                      setSummary('');
                      setRootCause('');
                      onChange();
                    }}
                  >
                    Marquer comme resolu
                  </button>
                  {summary.trim().length < 20 ? (
                    <span className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)' }}>
                      Une resolution exploitable demande au minimum une description du constat et de
                      l action.
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface MonitoringPanelProps {
  world: SimulationWorld;
  version: number;
  onChange: () => void;
}

/** Supervision alimentee par les sondes reelles du moteur. */
export function MonitoringPanel({ world, version, onChange }: MonitoringPanelProps): JSX.Element {
  const checks = useSimValue(version, () =>
    world.state.monitoringChecks.map((check) => ({
      check,
      sample: world.monitoring.sample(check),
    })),
  );
  const alerts = useSimValue(version, () => world.monitoring.activeAlerts());
  const correlations = useSimValue(version, () => world.monitoring.correlate());

  return (
    <div className="neo-panel" style={{ height: '100%' }}>
      <div className="neo-panel__head">
        <span>Supervision</span>
        <button
          type="button"
          className="neo-btn neo-btn--ghost neo-btn--sm"
          onClick={() => {
            world.monitoring.runAll();
            onChange();
          }}
        >
          Relancer les sondes
        </button>
      </div>
      <div className="neo-panel__body neo-scroll">
        <table className="neo-table">
          <thead>
            <tr>
              <th>Sonde</th>
              <th>Etat</th>
              <th>Mesure</th>
            </tr>
          </thead>
          <tbody>
            {checks.map(({ check, sample }) => (
              <tr key={check.id}>
                <td>{check.name}</td>
                <td>
                  <span
                    className={`neo-tag ${sample.ok ? 'neo-tag--ok' : sample.severity === 'critical' ? 'neo-tag--danger' : 'neo-tag--warn'}`}
                  >
                    {sample.ok ? 'normal' : sample.severity}
                  </span>
                </td>
                <td className="neo-mono neo-muted">{sample.message}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {alerts.length > 0 ? (
          <div style={{ marginTop: 'var(--neo-space-4)' }}>
            <h3 style={{ fontSize: 'var(--neo-fs-md)' }}>Alertes actives</h3>
            <div className="neo-stack">
              {alerts.map((alert) => (
                <div key={alert.id} className="nova-message nova-message--warning">
                  <div className="neo-row" style={{ justifyContent: 'space-between' }}>
                    <span>{alert.message}</span>
                    {alert.acknowledgedBy === undefined ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--ghost"
                        onClick={() => {
                          world.monitoring.acknowledge(alert.id, 'technicien');
                          onChange();
                        }}
                      >
                        Prendre en compte
                      </button>
                    ) : (
                      <span className="neo-tag">pris en compte</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {correlations.length > 0 ? (
          <p
            className="neo-muted"
            style={{ marginTop: 'var(--neo-space-3)', fontSize: 'var(--neo-fs-sm)' }}
          >
            Plusieurs alertes partagent un equipement amont commun : cherchez une cause unique avant
            de traiter chaque symptome separement.
          </p>
        ) : null}
      </div>
    </div>
  );
}
