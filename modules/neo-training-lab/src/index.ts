import type { CourseManifest, ModuleManifest } from '@tssr/contracts';
import { trainingLabScenario } from './scenario.ts';
import { missionPosteSansReseau } from './mission.ts';
import { trainingLabCompetencies, trainingLabKnowledge } from './knowledge.ts';

export const trainingLabManifest: ModuleManifest = {
  schemaVersion: 1,
  id: 'neo-training-lab',
  version: '1.0.0',
  name: 'NEO Training Lab',
  description:
    'Laboratoire de demonstration du Core TSSR NEO. Il n est pas un cours : il valide de bout en bout campus, simulation, terminal, ticket et evaluation.',
  compatibility: { coreApi: '>=1.0.0 <2.0.0', contractsSchemaVersion: 1 },
  competencies: trainingLabCompetencies,
  missionIds: [missionPosteSansReseau.id],
  knowledgeEntryIds: trainingLabKnowledge.map((k) => k.id),
  scenarioIds: [trainingLabScenario.id],
  approximateSizeBytes: 0,
  assets: [],
  license: 'MIT',
  authors: ['NEO Systems'],
  offlineCapable: true,
};

export const trainingLabCourse: CourseManifest = {
  schemaVersion: 1,
  id: 'neo-training-lab-parcours',
  moduleId: 'neo-training-lab',
  title: 'Prise en main : incident reseau sur un poste',
  summary:
    'Un parcours court pour decouvrir la methode de diagnostic, la segmentation VLAN et la documentation d un ticket.',
  path: [
    { kind: 'knowledge', entryId: 'kb-methode-diagnostic' },
    { kind: 'mission', missionId: missionPosteSansReseau.id },
    { kind: 'review', competencyIds: ['net-vlan-access', 'net-dhcp'], minutes: 10 },
  ],
  estimatedHours: 0.7,
  level: 'decouverte',
};

export { trainingLabScenario, missionPosteSansReseau, trainingLabCompetencies, trainingLabKnowledge };
export const trainingLabMissions = [missionPosteSansReseau];
