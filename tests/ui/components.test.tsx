import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { EventBus } from '@tssr/events';
import { SimulationWorld } from '@tssr/sim-world';
import { MissionRunner } from '@tssr/mission-engine';
import { KnowledgeLibrary } from '@tssr/knowledge';
import { Nova } from '@tssr/nova';
import { SwitchConsole } from '@tssr/sim-network';
import {
  missionPosteSansReseau,
  trainingLabCompetencies,
  trainingLabKnowledge,
  trainingLabScenario,
} from '@tssr/module-training-lab';
import {
  MonitoringPanel,
  NovaPanel,
  ObjectivesPanel,
  TicketsPanel,
} from '../../apps/web/src/components/MissionPanels.tsx';
import {
  TerminalPanel,
  switchConsoleAdapter,
  terminalAdapter,
} from '../../apps/web/src/components/TerminalPanel.tsx';

function buildWorld() {
  const state = trainingLabScenario.build({ seed: 7, params: { brokenVlan: 99 } });
  return new SimulationWorld(state, { bus: new EventBus(), seed: 7 });
}

/** Verifie l absence de violation d accessibilite serieuse sur un fragment rendu. */
async function expectNoSeriousAxeViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      // La couleur est verifiee separement : le DOM simule ne calcule pas les styles.
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map((violation) => `${violation.id} : ${violation.help}`),
    'violations d accessibilite',
  ).toEqual([]);
}

describe('panneau des objectifs', () => {
  it('reflete l etat reel et ne coche rien de lui-meme', async () => {
    const world = buildWorld();
    const runner = new MissionRunner(missionPosteSansReseau, world, { seed: 7 });
    runner.start();

    const { container, rerender } = render(<ObjectivesPanel runner={runner} version={0} />);
    expect(screen.getByText(/Objectifs/)).toBeInTheDocument();
    // Seul l objectif d absence de degat est rempli au demarrage.
    expect(screen.getByText('1/6')).toBeInTheDocument();
    await expectNoSeriousAxeViolations(container);

    // Correction reelle de la panne, puis reevaluation.
    world.network.setAccessVlan('sw-lab', 'Gi0/2', 10);
    world.network.renewDhcp('pc-camille', 'eth0');
    runner.tick();
    rerender(<ObjectivesPanel runner={runner} version={1} />);
    // Bail obtenu, serveur joint, resolution de noms retablie, plus l absence
    // de degat collateral : quatre objectifs sur six.
    expect(screen.getByText('4/6')).toBeInTheDocument();
  });

  it('affiche l ecart constate pour guider le diagnostic', () => {
    const world = buildWorld();
    const runner = new MissionRunner(missionPosteSansReseau, world, {
      seed: 7,
      difficulty: 'standard',
    });
    runner.start();
    render(<ObjectivesPanel runner={runner} version={0} />);
    expect(screen.getByText(/n a pas de bail DHCP conforme/)).toBeInTheDocument();
  });
});

describe('terminal', () => {
  it('execute reellement la commande saisie', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    const terminal = world.terminal('sys-srv-neo');
    expect(terminal).toBeDefined();

    const { container } = render(
      <TerminalPanel console={terminalAdapter(terminal!)} title="srv-neo" />,
    );
    await expectNoSeriousAxeViolations(container);

    const input = screen.getByLabelText(/Saisie de commande/);
    await user.type(input, 'ip a');
    await user.click(screen.getByRole('button', { name: /Executer la commande/ }));

    await waitFor(() => {
      expect(screen.getByRole('log')).toHaveTextContent('10.20.20.10/24');
    });
  });

  it('refuse explicitement une commande non implementee', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    render(
      <TerminalPanel console={terminalAdapter(world.terminal('sys-srv-neo')!)} title="srv-neo" />,
    );

    await user.type(screen.getByLabelText(/Saisie de commande/), 'tcpdump -i eth0');
    await user.click(screen.getByRole('button', { name: /Executer la commande/ }));

    await waitFor(() => {
      expect(screen.getByRole('log')).toHaveTextContent('non disponible dans cette simulation');
    });
  });

  it('le bouton reste inactif tant que rien n est saisi', () => {
    const world = buildWorld();
    render(
      <TerminalPanel console={terminalAdapter(world.terminal('sys-srv-neo')!)} title="srv-neo" />,
    );
    expect(screen.getByRole('button', { name: /Executer la commande/ })).toBeDisabled();
  });

  it('la console d equipement agit sur la topologie', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    const console_ = switchConsoleAdapter(new SwitchConsole(world.network, 'sw-lab'));
    render(<TerminalPanel console={console_} title="sw-lab" />);

    const input = screen.getByLabelText(/Saisie de commande/);
    const run = screen.getByRole('button', { name: /Executer la commande/ });
    for (const command of ['configure terminal', 'interface Gi0/2', 'switchport access vlan 10']) {
      await user.clear(input);
      await user.type(input, command);
      await user.click(run);
    }

    expect(
      world.network.node('sw-lab')?.interfaces.find((i) => i.name === 'Gi0/2')?.accessVlan,
    ).toBe(10);
  });
});

describe('panneau des tickets', () => {
  it('refuse une resolution trop succincte et explique pourquoi', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    const onChange = vi.fn();
    const { container } = render(<TicketsPanel world={world} version={0} onChange={onChange} />);
    await expectNoSeriousAxeViolations(container);

    const summary = screen.getByLabelText(/Resolution appliquee/);
    await user.type(summary, 'reparé');
    expect(screen.getByRole('button', { name: /Marquer comme resolu/ })).toBeDisabled();
    expect(screen.getByText(/resolution exploitable demande/)).toBeInTheDocument();
  });

  it('enregistre une resolution documentee dans l etat reel', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    const onChange = vi.fn();
    render(<TicketsPanel world={world} version={0} onChange={onChange} />);

    await user.type(
      screen.getByLabelText(/Resolution appliquee/),
      'Le port du poste etait reste dans le VLAN de quarantaine apres les travaux.',
    );
    await user.type(screen.getByLabelText(/Cause racine/), 'Erreur de brassage.');
    await user.click(screen.getByRole('button', { name: /Marquer comme resolu/ }));

    expect(world.itsm.ticket('inc-2041')?.status).toBe('resolved');
    expect(world.itsm.ticket('inc-2041')?.rootCause).toContain('brassage');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('panneau de supervision', () => {
  it('presente des mesures issues des sondes reelles', async () => {
    const world = buildWorld();
    const { container } = render(
      <MonitoringPanel world={world} version={0} onChange={() => undefined} />,
    );
    await expectNoSeriousAxeViolations(container);

    const table = screen.getByRole('table');
    // Le poste en panne ne peut pas etre supervise : la sonde le dit.
    expect(within(table).getByText(/aucune adresse IP a superviser/)).toBeInTheDocument();
    expect(within(table).getByText(/dns-server operationnel/)).toBeInTheDocument();
  });
});

describe('panneau NOVA', () => {
  it('pose une question avant de livrer une piste', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    const runner = new MissionRunner(missionPosteSansReseau, world, { seed: 7 });
    runner.start();
    const library = new KnowledgeLibrary()
      .addEntries(trainingLabKnowledge)
      .addCompetencies(trainingLabCompetencies);
    const nova = new Nova({ library, world, runner });

    const { container } = render(<NovaPanel nova={nova} version={0} onAction={() => undefined} />);
    await expectNoSeriousAxeViolations(container);

    await user.click(screen.getByRole('button', { name: /Par ou commencer/ }));
    const messages = await screen.findAllByText(/\?/);
    expect(messages.length).toBeGreaterThan(0);
    // La solution n est jamais donnee spontanement.
    expect(screen.queryByText(/VLAN 99/)).not.toBeInTheDocument();
  });

  it('un indice explicite est comptabilise', async () => {
    const user = userEvent.setup();
    const world = buildWorld();
    const runner = new MissionRunner(missionPosteSansReseau, world, { seed: 7 });
    runner.start();
    const library = new KnowledgeLibrary().addEntries(trainingLabKnowledge);
    const nova = new Nova({ library, world, runner });

    render(<NovaPanel nova={nova} version={0} onAction={() => undefined} />);
    await user.click(screen.getByRole('button', { name: /Demander un indice/ }));
    expect(runner.state.hintsUsed).toHaveLength(1);
  });
});
