import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_POLICY,
  PERMISSIONS,
  PolicyEngine,
  claimAdmin,
  createBootstrapState,
  guard,
  type Subject,
} from '@tssr/permissions';
import {
  HttpSyncProvider,
  InMemorySyncProvider,
  SyncEngine,
  backoffMs,
  makeOperation,
  mergeProgress,
} from '@tssr/sync';
import { AMBIENCES, AudioEngine, DEFAULT_LEVELS, EVENT_CUES } from '@tssr/audio';
import { MemoryStorageAdapter } from '@tssr/storage';
import { ClassroomStore, analyseCohort, createCohort } from '@tssr/classroom';
import { missionPosteSansReseau, trainingLabCompetencies } from '@tssr/module-training-lab';
import { createProfile } from '@tssr/progression';
import type { PlayerProgress } from '@tssr/contracts';

const guest: Subject = { role: 'guest', profileId: 'invite' };
const student: Subject = { role: 'student', profileId: 'eleve-1' };
const trainer: Subject = { role: 'trainer', profileId: 'form-1', classIds: ['classe-a'] };
const admin: Subject = { role: 'admin', profileId: 'admin-1' };

describe('permissions', () => {
  const engine = new PolicyEngine();

  it('un invite peut apprendre sans compte', () => {
    expect(engine.can(guest, 'mission:play').allowed).toBe(true);
    expect(engine.can(guest, 'knowledge:read').allowed).toBe(true);
    expect(engine.can(guest, 'review:play').allowed).toBe(true);
  });

  it('un refus explicite l emporte sur une autorisation', () => {
    const decision = engine.can(guest, 'progress:export');
    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe('guest-no-persistence');
    expect(decision.reason).toContain('conservation');
  });

  it('un apprenant n agit que sur sa propre progression', () => {
    expect(
      engine.can(student, 'progress:reset', { kind: 'profile', ownerId: 'eleve-1' }).allowed,
    ).toBe(true);
    expect(
      engine.can(student, 'progress:reset', { kind: 'profile', ownerId: 'eleve-2' }).allowed,
    ).toBe(false);
    expect(engine.can(student, 'progress:read-others').allowed).toBe(false);
  });

  it('un formateur ne voit que les groupes qu il encadre', () => {
    expect(
      engine.can(trainer, 'progress:read-others', { kind: 'class', classId: 'classe-a' }).allowed,
    ).toBe(true);
    expect(
      engine.can(trainer, 'progress:read-others', { kind: 'class', classId: 'classe-b' }).allowed,
    ).toBe(false);
  });

  it('l administrateur dispose de toutes les permissions declarees', () => {
    for (const permission of PERMISSIONS) {
      expect(engine.can(admin, permission).allowed).toBe(true);
    }
  });

  it('toute decision porte une raison lisible', () => {
    const refus = engine.can(student, 'class:manage');
    expect(refus.allowed).toBe(false);
    expect(refus.reason.length).toBeGreaterThan(10);
    expect(guard(engine, student, 'class:manage').title).toContain('Indisponible');
  });

  it('la politique est serialisable, donc rejouable par un service distant', () => {
    const serialized = JSON.parse(JSON.stringify(engine.serialize()));
    const replayed = new PolicyEngine(serialized);
    for (const subject of [guest, student, trainer, admin]) {
      for (const permission of PERMISSIONS) {
        expect(replayed.can(subject, permission).allowed).toBe(
          engine.can(subject, permission).allowed,
        );
      }
    }
    expect(serialized).toHaveLength(DEFAULT_POLICY.length);
  });

  it('la prise de controle initiale ne fonctionne qu une seule fois', () => {
    let state = createBootstrapState();
    const first = claimAdmin(state, 'admin-1', 1000);
    expect(first.decision.allowed).toBe(true);
    state = first.state;
    expect(state.locked).toBe(true);
    const second = claimAdmin(state, 'intrus', 2000);
    expect(second.decision.allowed).toBe(false);
    expect(second.state.adminProfileId).toBe('admin-1');
  });
});

describe('synchronisation', () => {
  function progressWith(patch: Partial<PlayerProgress>): PlayerProgress {
    return { ...createProfile('eleve-1'), ...patch };
  }

  it('tout fonctionne sans fournisseur : la file attend simplement', async () => {
    const engine = new SyncEngine({ storage: new MemoryStorageAdapter() });
    await engine.init();
    await engine.recordProgress(progressWith({ xp: 120 }));
    const state = await engine.flush();
    expect(state.status).toBe('hors-ligne');
    expect(engine.pending()).toHaveLength(1);
    expect(engine.localProgress()?.xp).toBe(120);
  });

  it('la file survit a un redemarrage', async () => {
    const storage = new MemoryStorageAdapter();
    const first = new SyncEngine({ storage });
    await first.init();
    await first.recordProgress(progressWith({ xp: 50 }));

    const second = new SyncEngine({ storage });
    await second.init();
    expect(second.pending()).toHaveLength(1);
  });

  it('rejouer la meme operation ne l applique qu une fois', async () => {
    const provider = new InMemorySyncProvider();
    const engine = new SyncEngine({ provider, storage: new MemoryStorageAdapter() });
    await engine.init();
    const progress = progressWith({ xp: 200 });
    await engine.recordProgress(progress);
    await engine.recordProgress(progress);
    // Meme contenu, donc meme cle d idempotence : une seule entree en file.
    expect(engine.pending()).toHaveLength(1);
    const state = await engine.flush();
    expect(state.status).toBe('idle');
    expect(engine.pending()).toHaveLength(0);
  });

  it('un conflit est fusionne sans perdre d acquis', async () => {
    const provider = new InMemorySyncProvider();
    const distant = progressWith({
      xp: 400,
      badges: [{ id: 'badge-autonome', earnedAt: 10 }],
      updatedAt: 10,
    });
    provider.seed('eleve-1', distant, 99);

    const engine = new SyncEngine({ provider, storage: new MemoryStorageAdapter() });
    await engine.init();
    await engine.recordProgress(
      progressWith({ xp: 250, badges: [{ id: 'badge-methodique', earnedAt: 20 }], updatedAt: 20 }),
    );

    await engine.flush();
    const merged = engine.localProgress();
    expect(merged?.xp).toBe(400);
    expect(merged?.badges.map((b) => b.id).sort()).toEqual(['badge-autonome', 'badge-methodique']);

    await engine.flush();
    expect(engine.pending()).toHaveLength(0);
  });

  it('la fusion retient la mesure la mieux etayee pour chaque competence', () => {
    const local = progressWith({
      competencies: [
        { competencyId: 'net-vlan-access', mastery: 0.4, confidence: 0.4, observations: 2 },
      ],
      updatedAt: 100,
    });
    const remote = progressWith({
      competencies: [
        { competencyId: 'net-vlan-access', mastery: 0.8, confidence: 1, observations: 9 },
      ],
      updatedAt: 50,
    });
    const merged = mergeProgress(local, remote);
    expect(merged.competencies[0]?.observations).toBe(9);
    // Les preferences suivent l appareil le plus recemment utilise.
    expect(merged.preferences).toEqual(local.preferences);
  });

  it('une panne passagere declenche des tentatives espacees puis un abandon', async () => {
    let calls = 0;
    const flaky = {
      id: 'instable',
      isAvailable: () => true,
      push: async () => {
        calls += 1;
        return { status: 'retry' as const, reason: 'service indisponible' };
      },
      pull: async () => undefined,
    };
    const waits: number[] = [];
    const engine = new SyncEngine({
      provider: flaky,
      storage: new MemoryStorageAdapter(),
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    await engine.init();
    await engine.recordProgress(progressWith({ xp: 10 }));

    for (let i = 0; i < 6; i += 1) await engine.flush();
    expect(calls).toBe(6);
    expect(engine.getState().status).toBe('erreur');
    expect(engine.getState().lastError).toContain('abandon');
    // L attente croit puis se stabilise : on n inonde pas un service en panne.
    expect(waits[1]).toBeGreaterThan(waits[0] as number);
    expect(backoffMs(20)).toBeLessThanOrEqual(60000);
  });

  it('le fournisseur HTTP se declare indisponible sans service configure', async () => {
    const provider = new HttpSyncProvider();
    expect(provider.isAvailable()).toBe(false);
    expect(await provider.pull('eleve-1', 0)).toBeUndefined();
  });

  it('le fournisseur HTTP transmet une cle d idempotence', async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init) seen.push(init);
      return new Response(JSON.stringify({ revision: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provider = new HttpSyncProvider({
      baseUrl: 'https://exemple.invalid',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const operation = makeOperation('upsert-progress', 'eleve-1', { xp: 1 }, 1, 0);
    const result = await provider.push(operation);
    expect(result).toEqual({ status: 'applied', revision: 7 });
    const headers = seen[0]?.headers as Record<string, string> | undefined;
    expect(headers?.['idempotency-key']).toBe(operation.id);
  });
});

describe('audio', () => {
  it('se declare indisponible sans contexte, sans jamais lever', async () => {
    const engine = new AudioEngine({ createContext: () => undefined });
    expect(await engine.resume()).toBe('indisponible');
    expect(engine.play('alerte')).toBe(false);
    expect(engine.startAmbience()).toBe(false);
    await engine.dispose();
  });

  it('construit un bus par famille de son et applique les niveaux', async () => {
    const gains: { value: number }[] = [];
    const makeGain = (): unknown => {
      const node = { gain: { value: 1 }, connect: () => undefined };
      gains.push(node.gain);
      return node;
    };
    const context = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createGain: makeGain,
      resume: async () => undefined,
      close: async () => undefined,
    };
    const engine = new AudioEngine({
      createContext: () => context as unknown as AudioContext,
      levels: { master: 0.5, sfx: 0.25 },
    });
    expect(await engine.resume()).toBe('actif');
    // Un bus maitre plus quatre bus dedies.
    expect(gains).toHaveLength(5);
    expect(gains[0]?.value).toBe(0.5);

    engine.setMuted(true);
    expect(engine.getStatus()).toBe('muet');
    expect(gains[0]?.value).toBe(0);
    expect(engine.play('alerte')).toBe(false);

    engine.setMuted(false);
    expect(gains[0]?.value).toBe(0.5);
    await engine.dispose();
  });

  it('adapte le lit sonore au lieu, sans recreer la source', async () => {
    /*
     * Contexte minimal : on ne verifie pas ce qui est entendu, mais que le
     * moteur change bien de caractere au lieu de couper puis relancer.
     */
    const filtres: { frequency: { value: number; setTargetAtTime: (v: number) => void } }[] = [];
    const gains: { gain: { value: number; setTargetAtTime: (v: number) => void } }[] = [];
    let sourcesDemarrees = 0;
    const context = {
      state: 'running',
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      createGain: () => {
        const node = {
          gain: {
            value: 1,
            setTargetAtTime(valeur: number) {
              node.gain.value = valeur;
            },
          },
          connect: () => undefined,
        };
        gains.push(node);
        return node;
      },
      createBuffer: (_c: number, longueur: number) => ({
        getChannelData: () => new Float32Array(longueur),
      }),
      createBufferSource: () => ({
        buffer: undefined,
        loop: false,
        connect: () => undefined,
        start: () => {
          sourcesDemarrees += 1;
        },
        stop: () => undefined,
      }),
      createBiquadFilter: () => {
        const node = {
          type: 'lowpass',
          frequency: {
            value: 0,
            setTargetAtTime(valeur: number) {
              node.frequency.value = valeur;
            },
          },
          connect: () => undefined,
        };
        filtres.push(node);
        return node;
      },
      resume: async () => undefined,
      close: async () => undefined,
    };
    const engine = new AudioEngine({
      createContext: () => context as unknown as AudioContext,
    });
    expect(await engine.resume()).toBe('actif');

    expect(engine.startAmbience('hall')).toBe(true);
    expect(sourcesDemarrees).toBe(1);
    expect(engine.currentAmbience()).toBe('hall');
    expect(filtres[0]?.frequency.value).toBe(AMBIENCES.hall.cutoff);

    // Passer dans un local technique : plus fort et plus aigu, meme source.
    engine.setAmbience('technique');
    expect(sourcesDemarrees).toBe(1);
    expect(engine.currentAmbience()).toBe('technique');
    expect(filtres[0]?.frequency.value).toBe(AMBIENCES.technique.cutoff);
    expect(AMBIENCES.technique.gain).toBeGreaterThan(AMBIENCES.calme.gain);

    await engine.dispose();
  });

  it('les niveaux par defaut couvrent les quatre bus', () => {
    expect(Object.keys(DEFAULT_LEVELS).sort()).toEqual([
      'ambience',
      'master',
      'music',
      'sfx',
      'voice',
    ]);
  });

  it('chaque son associe correspond a un evenement reel du moteur', () => {
    const known = [
      'mission.objective.completed',
      'mission.objective.regressed',
      'monitoring.alert.raised',
      'hardware.patched',
      'hardware.unpatched',
      'remote.session.opened',
      'itsm.ticket.created',
    ];
    expect(Object.keys(EVENT_CUES).sort()).toEqual([...known].sort());
  });
});

describe('cockpit formateur', () => {
  async function cohortWith(masteries: number[]) {
    const store = new ClassroomStore(new MemoryStorageAdapter(), createCohort());
    await store.upsertLocalLearner({
      ...createProfile('local-1', 'Apprenant local'),
      competencies: trainingLabCompetencies.map((c) => ({
        competencyId: c.id,
        mastery: masteries[0] ?? 0,
        confidence: 0.8,
        observations: 5,
      })),
    });
    for (const [index, mastery] of masteries.slice(1).entries()) {
      await store.addDemonstrationLearner({
        id: `demo-${index}`,
        displayName: `Demo ${index}`,
        progress: {
          ...createProfile(`demo-${index}`),
          competencies: trainingLabCompetencies.map((c) => ({
            competencyId: c.id,
            mastery,
            confidence: 0.7,
            observations: 4,
          })),
        },
      });
    }
    return store;
  }

  it('distingue explicitement les profils de demonstration', async () => {
    const store = await cohortWith([0.9, 0.2, 0.3]);
    const cohort = store.get();
    expect(cohort.learners.filter((l) => l.origin === 'local')).toHaveLength(1);
    expect(cohort.learners.filter((l) => l.origin === 'demonstration')).toHaveLength(2);
    const report = analyseCohort(cohort, trainingLabCompetencies, [missionPosteSansReseau]);
    expect(report.demonstrationLearners).toBe(2);
  });

  it('une competence jamais pratiquee n est pas comptee comme nulle', async () => {
    const store = new ClassroomStore(new MemoryStorageAdapter(), createCohort());
    await store.upsertLocalLearner(createProfile('local-1'));
    const report = analyseCohort(store.get(), trainingLabCompetencies, [missionPosteSansReseau]);
    for (const entry of report.competencies) {
      expect(entry.learnersMeasured).toBe(0);
    }
    // Sans mesure, aucun point faible ne peut etre affirme.
    expect(report.weakPoints).toEqual([]);
  });

  it('classe les points faibles par urgence pedagogique', async () => {
    const store = await cohortWith([0.15, 0.2, 0.25]);
    const report = analyseCohort(store.get(), trainingLabCompetencies, [missionPosteSansReseau]);
    expect(report.weakPoints.length).toBeGreaterThan(0);
    expect(report.weakPoints[0]?.reason).toContain('moitie');
    const severities = report.weakPoints.map((p) => p.severity);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
  });

  it('l avancement d une affectation suit la progression reelle', async () => {
    const store = await cohortWith([0.8, 0.4]);
    const assignment = await store.createAssignment(
      {
        missionId: missionPosteSansReseau.id,
        title: 'Mission de demonstration',
        learnerIds: store.get().learners.map((l) => l.id),
      },
      1000,
    );
    expect(store.assignmentProgress(assignment)).toEqual({ done: 0, total: 2 });

    const learner = store.get().learners[0];
    if (learner) {
      learner.progress.missions = [
        {
          missionId: missionPosteSansReseau.id,
          attempts: 1,
          completed: true,
          lastPlayedAt: 2000,
        },
      ];
    }
    expect(store.assignmentProgress(assignment)).toEqual({ done: 1, total: 2 });
  });
});
