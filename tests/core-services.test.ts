import { describe, expect, it } from 'vitest';
import { EventBus, Rng } from '@tssr/events';
import { MemoryStorageAdapter, SaveManager, diffWorlds, sealSave, verifySave } from '@tssr/storage';
import {
  applyMissionResult,
  checkPrerequisites,
  createProfile,
  levelForXp,
  planReviewSession,
  suggestDifficulty,
  updateMastery,
} from '@tssr/progression';
import { KnowledgeLibrary, SearchIndex, buildReviewSession, checkAnswer } from '@tssr/knowledge';
import { Nova } from '@tssr/nova';
import { SimulationWorld } from '@tssr/sim-world';
import { MissionRunner } from '@tssr/mission-engine';
import {
  missionPosteSansReseau,
  trainingLabCompetencies,
  trainingLabKnowledge,
  trainingLabScenario,
} from '@tssr/module-training-lab';
import type { MissionScore, SaveState } from '@tssr/contracts';

function buildWorld() {
  const state = trainingLabScenario.build({ seed: 7, params: {} });
  return new SimulationWorld(state, { bus: new EventBus(), seed: 7 });
}

function baseSave(world: ReturnType<typeof buildWorld>): SaveState {
  return sealSave({
    schemaVersion: 1,
    id: 'autosave',
    coreVersion: '0.1.0',
    createdAt: 1000,
    updatedAt: 1000,
    seed: 7,
    world: world.snapshotState(),
    eventLog: world.bus.toLog(),
    presence: { area: 'lobby', position: [0, 0, 0], rotationY: 0, cameraMode: 'third-person' },
  });
}

describe('sauvegarde et reprise', () => {
  it('detecte une sauvegarde alteree par son empreinte', async () => {
    const world = buildWorld();
    const save = baseSave(world);
    expect(verifySave(save)).toBe(true);
    const tampered: SaveState = { ...save, world: { ...save.world, seed: 999 } };
    expect(verifySave(tampered)).toBe(false);
  });

  it('propose une reprise apres un arret anormal', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);
    const world = buildWorld();
    await manager.markSessionOpen();
    await manager.write(baseSave(world));
    expect(await manager.detectUncleanShutdown()).toBe(true);
    const recovery = await manager.findRecoveryPoint();
    expect(recovery.source).toBe('autosave');
    await manager.markSessionClosed();
    expect(await manager.detectUncleanShutdown()).toBe(false);
  });

  it('se rabat sur un point de controle sain si la sauvegarde est corrompue', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);
    const world = buildWorld();
    const healthy = baseSave(world);
    await manager.takeSnapshot({
      schemaVersion: 1,
      id: 'snap-1',
      name: 'avant intervention',
      kind: 'checkpoint',
      createdAt: 900,
      saveId: healthy.id,
      save: healthy,
    });
    await storage.put('saves', 'autosave', { ...healthy, integrity: 'deadbeefdeadbeef' });
    const recovery = await manager.findRecoveryPoint();
    expect(recovery.source).toBe('checkpoint');
  });

  it('purge d abord les caches et jamais la progression', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);
    const progress = createProfile('p1');
    await manager.saveProgress(progress);
    await storage.put('cache', 'asset-1', { blob: 'x'.repeat(2000) });
    await storage.put('modules', 'mod-1', { blob: 'y'.repeat(1000) });
    const result = await manager.reclaim(500);
    expect(result.cleared).toContain('cache');
    expect(await manager.loadProgress('p1')).toBeDefined();
  });

  it('refuse un export dont le contenu a ete modifie', async () => {
    const manager = new SaveManager(new MemoryStorageAdapter());
    const progress = createProfile('p1');
    const exported = manager.buildExport(progress, [], '0.1.0');
    expect(manager.importExport(exported).ok).toBe(true);
    const altered = { ...exported, progress: { ...progress, xp: 99999 } };
    const result = manager.importExport(altered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('integrite');
  });

  it('resume lisiblement les differences entre deux etats', () => {
    const before = buildWorld();
    const snapshot = before.snapshotState();
    before.network.setAccessVlan('sw-lab', 'Gi0/2', 10);
    before.network.setServiceStatus('srv-neo', 'svc-smb', 'stopped');
    const changes = diffWorlds(snapshot, before.state);
    expect(changes.some((c) => c.includes('VLAN 99 -> 10'))).toBe(true);
    expect(changes.some((c) => c.includes('partage-fichiers'))).toBe(true);
  });
});

describe('progression', () => {
  const score: MissionScore = {
    missionId: missionPosteSansReseau.id,
    dimensions: {
      technicalAccuracy: 1,
      diagnosis: 0.9,
      autonomy: 1,
      efficiency: 1,
      impact: 1,
      safety: 1,
      verification: 0.8,
      documentation: 1,
    },
    overall: 0.95,
    objectivesCompleted: 6,
    objectivesTotal: 6,
    hintsUsed: 0,
    durationMs: 900000,
    competencyDeltas: missionPosteSansReseau.competencies.map((c) => ({ competencyId: c, delta: 0.4 })),
  };

  it('accorde de l experience, des badges et fait progresser la maitrise', () => {
    const profile = createProfile('p1');
    const result = applyMissionResult(profile, missionPosteSansReseau, score, 1000);
    expect(result.xpGained).toBeGreaterThan(0);
    expect(result.progress.level).toBe(levelForXp(result.progress.xp));
    expect(result.newBadges.map((b) => b.id)).toContain('badge-premiere-resolution');
    expect(result.newBadges.map((b) => b.id)).toContain('badge-autonome');
    expect(result.masteryChanges.every((m) => m.after > m.before)).toBe(true);
  });

  it('reduit fortement l experience d une mission rejouee', () => {
    const profile = createProfile('p1');
    const first = applyMissionResult(profile, missionPosteSansReseau, score, 1000);
    const second = applyMissionResult(first.progress, missionPosteSansReseau, score, 2000);
    expect(second.xpGained).toBeLessThan(first.xpGained);
  });

  it('une seule reussite ne suffit pas a declarer une competence acquise', () => {
    let mastery = updateMastery(undefined, 'net-vlan-access', 1, 0);
    expect(mastery.mastery).toBeLessThan(0.8);
    expect(mastery.confidence).toBeLessThan(0.5);
    for (let i = 0; i < 5; i += 1) mastery = updateMastery(mastery, 'net-vlan-access', 1, i * 1000);
    expect(mastery.mastery).toBeGreaterThan(0.8);
    expect(mastery.confidence).toBe(1);
  });

  it('programme les revisions de plus en plus loin quand la maitrise monte', () => {
    const weak = updateMastery(undefined, 'a', 0.2, 0);
    const strong = updateMastery({ competencyId: 'b', mastery: 0.9, confidence: 1, observations: 6 }, 'b', 1, 0);
    expect(strong.dueAt ?? 0).toBeGreaterThan(weak.dueAt ?? 0);
  });

  it('n avance la difficulte que d un cran a la fois', () => {
    const profile = createProfile('p1');
    profile.competencies = missionPosteSansReseau.competencies.map((id) => ({
      competencyId: id,
      mastery: 0.95,
      confidence: 1,
      observations: 8,
    }));
    expect(suggestDifficulty(profile, missionPosteSansReseau.competencies, 'guided')).toBe('standard');
    expect(suggestDifficulty(profile, missionPosteSansReseau.competencies, 'standard')).toBe('advanced');
  });

  it('n interdit un contenu que sur un prerequis explicitement bloquant', () => {
    const profile = createProfile('p1');
    const report = checkPrerequisites(profile, [
      { competencyId: 'net-vlan-access', requiredMastery: 0.5, blocking: false },
      { competencyId: 'net-dhcp', requiredMastery: 0.5, blocking: true },
    ]);
    expect(report.satisfied).toBe(false);
    expect(report.advisory).toHaveLength(1);
    expect(report.blocking).toHaveLength(1);
  });

  it('planifie une session de revision dimensionnee au temps disponible', () => {
    const profile = createProfile('p1');
    profile.competencies = trainingLabCompetencies.map((c) => ({
      competencyId: c.id,
      mastery: 0.3,
      confidence: 0.4,
      observations: 2,
      dueAt: 0,
    }));
    const plan = planReviewSession(profile, 10, 100000);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(4);
    expect(plan[0]?.reason).toBe('due');
  });
});

describe('base de connaissances', () => {
  const library = new KnowledgeLibrary()
    .addEntries(trainingLabKnowledge)
    .addCompetencies(trainingLabCompetencies)
    .addMissions([missionPosteSansReseau]);

  it('trouve une fiche malgre une faute de frappe', () => {
    const results = library.search('vlna');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.id).toBe('kb-vlan');
  });

  it('classe la fiche la plus pertinente en tete', () => {
    expect(library.search('169.254 auto-configuration')[0]?.entry.id).toBe('kb-apipa');
    expect(library.search('renouveler bail dhcp commande')[0]?.entry.kind).toBe('command');
  });

  it('filtre par domaine et par module', () => {
    const support = library.all({ domain: 'support' });
    expect(support.every((e) => e.domain === 'support')).toBe(true);
    expect(library.all({ moduleId: 'neo-training-lab' }).length).toBe(trainingLabKnowledge.length);
  });

  it('construit un graphe sans relation orpheline ni cycle', () => {
    const graph = library.buildGraph();
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(graph.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(library.detectCycles()).toEqual([]);
  });

  it('recommande en priorite ce qui est du a revision', () => {
    const recommendations = library.recommend(
      [
        { competencyId: 'net-vlan-access', mastery: 0.2, confidence: 0.3, observations: 1, dueAt: 0 },
        { competencyId: 'itsm-documentation', mastery: 0.95, confidence: 1, observations: 9, dueAt: 9_999_999_999_999 },
      ],
      3,
      100000,
    );
    expect(recommendations[0]?.reason).toBe('revision arrivee a echeance');
  });

  it('genere une session de revision a partir de fiches reelles', () => {
    const challenges = buildReviewSession(
      library,
      trainingLabCompetencies.map((c) => ({ competencyId: c.id, mastery: 0.3, confidence: 0.4, observations: 1, dueAt: 0 })),
      { minutes: 10, rng: new Rng(3), now: 100000 },
    );
    expect(challenges.length).toBeGreaterThan(0);
    for (const challenge of challenges) {
      expect(library.entry(challenge.entryId)).toBeDefined();
      expect(challenge.answers.length).toBeGreaterThan(0);
    }
    const command = challenges.find((c) => c.kind === 'command');
    if (command) {
      expect(checkAnswer(command, command.answers[0] as string)).toBe(true);
      expect(checkAnswer(command, 'reponse fantaisiste')).toBe(false);
    }
  });

  it('l index de recherche reste utilisable a vide', () => {
    expect(new SearchIndex().search('quoi que ce soit')).toEqual([]);
  });
});

describe('NOVA', () => {
  function novaSetup() {
    const world = buildWorld();
    const runner = new MissionRunner(missionPosteSansReseau, world, { seed: 7 });
    runner.start();
    const library = new KnowledgeLibrary().addEntries(trainingLabKnowledge).addCompetencies(trainingLabCompetencies);
    return { world, runner, nova: new Nova({ library, world, runner }) };
  }

  it('pose une question avant de donner une piste', () => {
    const { nova } = novaSetup();
    const guidance = nova.guidance();
    expect(guidance.source).toBe('rules');
    expect(guidance.text).toContain('?');
    expect(guidance.text.toLowerCase()).not.toContain('vlan 99');
    expect(guidance.checks.length).toBeGreaterThan(0);
  });

  it('ne delivre la solution que par les indices explicites de la mission', () => {
    const { nova, runner } = novaSetup();
    const first = nova.requestHint();
    expect(first.source).toBe('hint');
    expect(runner.state.hintsUsed).toHaveLength(1);
  });

  it('repond a partir des fiches du module et admet ses limites', () => {
    const { nova } = novaSetup();
    const known = nova.answer('a quoi sert un vlan');
    expect(known.source).toBe('knowledge');
    expect(known.knowledgeEntryIds).toContain('kb-vlan');
    const unknown = nova.answer('zzzzqqqwwwxyz');
    expect(unknown.source).toBe('rules');
    expect(unknown.text).toContain('pas de fiche');
  });

  it('se fait plus discrete avec l experience', () => {
    const { nova } = novaSetup();
    const beginner = createProfile('p1');
    nova.setProgress(beginner);
    expect(nova.shouldSpeakProactively()).toBe(true);
    const senior = { ...createProfile('p2'), level: 12 };
    nova.setProgress(senior);
    expect(nova.shouldSpeakProactively()).toBe(false);
  });

  it('signale une sauvegarde jamais testee', () => {
    const { nova, world } = novaSetup();
    world.backup.run('job-srv-neo');
    const observations = nova.observations();
    expect(observations.some((o) => o.text.includes('test de restauration'))).toBe(true);
  });

  it('felicite quand les objectifs techniques sont atteints', () => {
    const { nova, world, runner } = novaSetup();
    world.network.setAccessVlan('sw-lab', 'Gi0/2', 10);
    world.network.renewDhcp('pc-camille', 'eth0');
    world.itsm.resolve(
      'inc-2041',
      'Le port etait dans le VLAN de quarantaine apres les travaux, il a ete replace dans le VLAN bureautique.',
      'Erreur de configuration de port lors des travaux.',
    );
    runner.tick();
    expect(nova.guidance().tone).toBe('encouraging');
  });
});
