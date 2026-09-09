import type { Role } from '@tssr/contracts';

/**
 * Autorisations TSSR NEO.
 *
 * **Le frontal n est jamais une autorite.** Les verifications faites ici servent
 * a ne pas proposer une action impossible, donc au confort et a la lisibilite.
 * Lorsqu un service distant sera branche, il devra reevaluer exactement les
 * memes regles de son cote : c est pourquoi elles sont declarees sous forme de
 * donnees serialisables et non de code, et que le moteur ne depend d aucune API
 * de navigateur.
 */

export const PERMISSIONS = [
  'mission:play',
  'mission:restart',
  'mission:skip-prerequisites',
  'lab:build',
  'lab:inject-failure',
  'snapshot:create',
  'snapshot:restore',
  'knowledge:read',
  'review:play',
  'progress:read-own',
  'progress:read-others',
  'progress:export',
  'progress:reset',
  'class:read',
  'class:manage',
  'assignment:create',
  'report:read',
  'module:install',
  'diagnostics:read',
  'admin:bootstrap',
  'admin:manage-roles',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Subject {
  role: Role;
  profileId: string;
  /** Groupes dont le sujet est formateur ou membre. */
  classIds?: readonly string[];
}

export interface Resource {
  kind: 'profile' | 'class' | 'mission' | 'lab' | 'snapshot' | 'report' | 'system';
  /** Proprietaire de la ressource, lorsque la notion a un sens. */
  ownerId?: string;
  classId?: string;
}

export type RuleEffect = 'allow' | 'deny';

/** Une regle est une donnee : elle peut etre transmise et rejouee cote serveur. */
export interface PolicyRule {
  id: string;
  effect: RuleEffect;
  roles: readonly Role[];
  permissions: readonly Permission[];
  /** Restreint la regle aux ressources dont le sujet est proprietaire. */
  ownOnly?: boolean;
  /** Restreint la regle aux ressources d une classe encadree par le sujet. */
  ownClassOnly?: boolean;
  reason: string;
}

/**
 * Politique par defaut.
 * Les refus explicites passent avant les autorisations, comme dans toute
 * politique de securite serieuse.
 */
export const DEFAULT_POLICY: readonly PolicyRule[] = [
  {
    id: 'guest-base',
    effect: 'allow',
    roles: ['guest'],
    permissions: [
      'mission:play',
      'mission:restart',
      'lab:build',
      'knowledge:read',
      'review:play',
      'progress:read-own',
    ],
    reason: 'le mode invite doit permettre d apprendre sans compte',
  },
  {
    id: 'guest-no-persistence',
    effect: 'deny',
    roles: ['guest'],
    permissions: ['snapshot:restore', 'progress:export'],
    reason: 'un invite n a pas d espace de conservation garanti',
  },
  {
    id: 'student-base',
    effect: 'allow',
    roles: ['student'],
    permissions: [
      'mission:play',
      'mission:restart',
      'lab:build',
      'lab:inject-failure',
      'snapshot:create',
      'snapshot:restore',
      'knowledge:read',
      'review:play',
      'progress:read-own',
      'progress:export',
      'progress:reset',
    ],
    ownOnly: true,
    reason: 'un apprenant agit sur sa propre progression',
  },
  {
    id: 'trainer-base',
    effect: 'allow',
    roles: ['trainer'],
    permissions: [
      'mission:play',
      'mission:restart',
      'mission:skip-prerequisites',
      'lab:build',
      'lab:inject-failure',
      'snapshot:create',
      'snapshot:restore',
      'knowledge:read',
      'review:play',
      'progress:read-own',
      'progress:export',
      'class:read',
      'assignment:create',
      'report:read',
      'diagnostics:read',
    ],
    reason: 'un formateur prepare et suit des seances',
  },
  {
    id: 'trainer-own-class',
    effect: 'allow',
    roles: ['trainer'],
    permissions: ['progress:read-others', 'class:manage'],
    ownClassOnly: true,
    reason: 'un formateur ne voit que les groupes qu il encadre',
  },
  {
    id: 'admin-base',
    effect: 'allow',
    roles: ['admin'],
    permissions: [...PERMISSIONS],
    reason: 'l administrateur dispose de l ensemble des droits',
  },
  {
    id: 'bootstrap-unique',
    effect: 'deny',
    roles: ['guest', 'student', 'trainer'],
    permissions: ['admin:bootstrap', 'admin:manage-roles'],
    reason: 'la prise de controle initiale est reservee et se verrouille apres usage',
  },
];

export interface Decision {
  allowed: boolean;
  /** Explication lisible : elle est affichee, jamais devinee par l interface. */
  reason: string;
  ruleId?: string;
}

/**
 * Moteur de decision.
 * Sans dependance au navigateur : le meme moteur peut tourner dans un service
 * distant, ce qui est la condition pour ne pas faire confiance au frontal.
 */
export class PolicyEngine {
  private readonly rules: readonly PolicyRule[];

  constructor(rules: readonly PolicyRule[] = DEFAULT_POLICY) {
    this.rules = rules;
  }

  private matches(
    rule: PolicyRule,
    subject: Subject,
    permission: Permission,
    resource?: Resource,
  ): boolean {
    if (!rule.roles.includes(subject.role)) return false;
    if (!rule.permissions.includes(permission)) return false;
    if (rule.ownOnly === true) {
      if (resource?.ownerId !== undefined && resource.ownerId !== subject.profileId) return false;
    }
    if (rule.ownClassOnly === true) {
      const classId = resource?.classId;
      if (classId === undefined) return false;
      if (!(subject.classIds ?? []).includes(classId)) return false;
    }
    return true;
  }

  can(subject: Subject, permission: Permission, resource?: Resource): Decision {
    // Un refus explicite l emporte toujours sur une autorisation.
    for (const rule of this.rules) {
      if (rule.effect !== 'deny') continue;
      if (this.matches(rule, subject, permission, resource)) {
        return { allowed: false, reason: rule.reason, ruleId: rule.id };
      }
    }
    for (const rule of this.rules) {
      if (rule.effect !== 'allow') continue;
      if (this.matches(rule, subject, permission, resource)) {
        return { allowed: true, reason: rule.reason, ruleId: rule.id };
      }
    }
    return {
      allowed: false,
      reason: `aucune regle n autorise "${permission}" pour le role ${subject.role}`,
    };
  }

  /** Liste des permissions effectives, utile pour construire un menu. */
  effectivePermissions(subject: Subject, resource?: Resource): Permission[] {
    return PERMISSIONS.filter((permission) => this.can(subject, permission, resource).allowed);
  }

  /** Politique serialisable, prete a etre transmise a un service distant. */
  serialize(): readonly PolicyRule[] {
    return this.rules;
  }
}

export const defaultPolicy = new PolicyEngine();

/**
 * Prise de controle administrateur initiale.
 *
 * Aucun administrateur n est code en dur. La procedure ne peut aboutir qu une
 * fois : une fois un administrateur declare, elle se verrouille definitivement.
 */
export interface BootstrapState {
  locked: boolean;
  adminProfileId?: string;
  lockedAt?: number;
}

export function createBootstrapState(): BootstrapState {
  return { locked: false };
}

export function claimAdmin(
  state: BootstrapState,
  profileId: string,
  now: number,
): { state: BootstrapState; decision: Decision } {
  if (state.locked) {
    return {
      state,
      decision: {
        allowed: false,
        reason: 'la prise de controle initiale a deja ete utilisee et est verrouillee',
        ruleId: 'bootstrap-unique',
      },
    };
  }
  return {
    state: { locked: true, adminProfileId: profileId, lockedAt: now },
    decision: {
      allowed: true,
      reason: 'premiere prise de controle acceptee',
      ruleId: 'bootstrap-unique',
    },
  };
}

/**
 * Garde d interface.
 * Retourne l action a proposer et, si elle est indisponible, la raison a afficher.
 * Elle ne remplace jamais une verification cote service.
 */
export function guard(
  engine: PolicyEngine,
  subject: Subject,
  permission: Permission,
  resource?: Resource,
): { available: boolean; title: string } {
  const decision = engine.can(subject, permission, resource);
  return {
    available: decision.allowed,
    title: decision.allowed ? '' : `Indisponible : ${decision.reason}`,
  };
}
