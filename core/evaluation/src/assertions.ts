import type { Assertion, LeafAssertion, WorldState } from '@tssr/contracts';
import { hashObject } from '@tssr/events';
import type { SimulationWorld } from '@tssr/sim-world';
import { effectiveRoutes, inCidr, lookupRoute } from '@tssr/sim-network';

export interface AssertionResult {
  passed: boolean;
  /** Explication lisible : c est ce qui alimente le debrief, pas un simple booleen. */
  detail: string;
  children?: AssertionResult[];
}

export interface EvaluationContext {
  world: SimulationWorld;
  /** Etat de reference pris au demarrage, pour detecter les degats collateraux. */
  baseline?: WorldState;
}

function pass(detail: string): AssertionResult {
  return { passed: true, detail };
}
function fail(detail: string): AssertionResult {
  return { passed: false, detail };
}

function expected(
  value: boolean,
  actual: boolean,
  okText: string,
  koText: string,
): AssertionResult {
  return actual === value ? pass(okText) : fail(koText);
}

function resolveTarget(
  ctx: EvaluationContext,
  fromNodeId: string,
  target: string,
): string | undefined {
  const dns = ctx.world.network.resolve(fromNodeId, target);
  return dns.resolved ? dns.address : undefined;
}

function baselineSlice(
  ctx: EvaluationContext,
  scope: 'node' | 'system' | 'service',
  id: string,
): unknown {
  const state = ctx.baseline;
  if (!state) return undefined;
  if (scope === 'node') return state.network.nodes.find((n) => n.id === id);
  if (scope === 'system') return state.systems.find((s) => s.id === id);
  for (const node of state.network.nodes) {
    const service = node.services.find((s) => s.id === id);
    if (service) return service;
  }
  return undefined;
}

function currentSlice(
  ctx: EvaluationContext,
  scope: 'node' | 'system' | 'service',
  id: string,
): unknown {
  const state = ctx.world.state;
  if (scope === 'node') return state.network.nodes.find((n) => n.id === id);
  if (scope === 'system') return state.systems.find((s) => s.id === id);
  for (const node of state.network.nodes) {
    const service = node.services.find((s) => s.id === id);
    if (service) return service;
  }
  return undefined;
}

function evaluateLeaf(assertion: LeafAssertion, ctx: EvaluationContext): AssertionResult {
  const world = ctx.world;
  switch (assertion.type) {
    case 'ping-reachable': {
      const address = resolveTarget(ctx, assertion.from, assertion.to);
      if (address === undefined) {
        return expected(
          assertion.expect,
          false,
          '',
          `${assertion.to} n est pas resolu depuis ${assertion.from}`,
        );
      }
      const reach = world.network.reach(assertion.from, address);
      const ok = reach.delivered && reach.returnOk;
      return expected(
        assertion.expect,
        ok,
        `${assertion.from} joint ${assertion.to}`,
        ok
          ? `${assertion.from} joint ${assertion.to} alors que cela ne devrait pas etre le cas`
          : `${assertion.from} ne joint pas ${assertion.to} : ${reach.failure?.detail ?? 'pas de route de retour'}`,
      );
    }
    case 'service-reachable': {
      const address = resolveTarget(ctx, assertion.from, assertion.to);
      if (address === undefined) {
        return expected(
          assertion.expect,
          false,
          '',
          `${assertion.to} n est pas resolu depuis ${assertion.from}`,
        );
      }
      const result = world.network.connect(
        assertion.from,
        address,
        assertion.port,
        assertion.protocol,
      );
      return expected(
        assertion.expect,
        result.connected,
        `${assertion.from} accede a ${assertion.to}:${assertion.port}`,
        result.connected
          ? `${assertion.to}:${assertion.port} est accessible alors qu il devrait etre bloque`
          : `${assertion.to}:${assertion.port} inaccessible : ${result.failure?.detail ?? 'inconnu'}`,
      );
    }
    case 'dns-resolves': {
      const dns = world.network.resolve(assertion.from, assertion.name);
      if (!dns.resolved) {
        return expected(
          assertion.expect,
          false,
          '',
          `${assertion.name} non resolu : ${dns.failure?.detail ?? ''}`,
        );
      }
      if (assertion.expectedAddress !== undefined && dns.address !== assertion.expectedAddress) {
        return fail(
          `${assertion.name} resout vers ${dns.address} au lieu de ${assertion.expectedAddress}`,
        );
      }
      return expected(
        assertion.expect,
        true,
        `${assertion.name} resout vers ${dns.address}`,
        `${assertion.name} ne devrait pas resoudre`,
      );
    }
    case 'dhcp-lease': {
      const node = world.network.node(assertion.nodeId);
      const address = node?.interfaces.flatMap((i) => i.addresses).find((a) => a.source === 'dhcp');
      const ok =
        address !== undefined &&
        (assertion.expectedSubnet === undefined ||
          inCidr(address.address, assertion.expectedSubnet));
      return expected(
        assertion.expect,
        ok,
        `${assertion.nodeId} possede un bail DHCP (${address?.address})`,
        `${assertion.nodeId} n a pas de bail DHCP conforme`,
      );
    }
    case 'interface-address': {
      const node = world.network.node(assertion.nodeId);
      const iface = node?.interfaces.find(
        (i) => i.name.toLowerCase() === assertion.interfaceName.toLowerCase(),
      );
      if (!iface)
        return fail(`interface ${assertion.interfaceName} introuvable sur ${assertion.nodeId}`);
      if (assertion.enabled !== undefined && iface.enabled !== assertion.enabled) {
        return fail(`${assertion.interfaceName} est ${iface.enabled ? 'active' : 'desactivee'}`);
      }
      if (assertion.address !== undefined) {
        const found = iface.addresses.find((a) => a.address === assertion.address);
        if (!found) {
          return fail(
            `${assertion.interfaceName} porte ${iface.addresses.map((a) => a.address).join(', ') || 'aucune adresse'} au lieu de ${assertion.address}`,
          );
        }
        if (assertion.prefix !== undefined && found.prefix !== assertion.prefix) {
          return fail(
            `${assertion.address} est configuree en /${found.prefix} au lieu de /${assertion.prefix}`,
          );
        }
      }
      return pass(`${assertion.interfaceName} est correctement configuree`);
    }
    case 'has-route': {
      const node = world.network.node(assertion.nodeId);
      if (!node) return fail(`${assertion.nodeId} introuvable`);
      const routes = effectiveRoutes(node);
      const match = routes.find(
        (r) =>
          r.destination === assertion.destination &&
          (assertion.via === undefined || r.via === assertion.via),
      );
      return match
        ? pass(`route ${assertion.destination} presente sur ${node.hostname}`)
        : fail(
            `aucune route ${assertion.destination}${assertion.via ? ` via ${assertion.via}` : ''} sur ${node.hostname}`,
          );
    }
    case 'interface-vlan': {
      const node = world.network.node(assertion.nodeId);
      const iface = node?.interfaces.find(
        (i) => i.name.toLowerCase() === assertion.interfaceName.toLowerCase(),
      );
      if (!iface) return fail(`interface ${assertion.interfaceName} introuvable`);
      if (assertion.mode !== undefined && iface.mode !== assertion.mode) {
        return fail(
          `${assertion.interfaceName} est en mode ${iface.mode} au lieu de ${assertion.mode}`,
        );
      }
      if (assertion.accessVlan !== undefined && iface.accessVlan !== assertion.accessVlan) {
        return fail(
          `${assertion.interfaceName} est dans le VLAN ${iface.accessVlan ?? '(aucun)'} au lieu de ${assertion.accessVlan}`,
        );
      }
      if (assertion.trunkContains !== undefined) {
        const missing = assertion.trunkContains.filter(
          (v) => !iface.trunkVlans.includes(v) && iface.nativeVlan !== v,
        );
        if (missing.length > 0) return fail(`VLAN absents du trunk : ${missing.join(', ')}`);
      }
      return pass(`${assertion.interfaceName} est configuree comme attendu`);
    }
    case 'link-up': {
      const link = world.state.network.links.find((l) => l.id === assertion.linkId);
      if (!link) return fail(`lien ${assertion.linkId} introuvable`);
      return expected(
        assertion.expect,
        link.connected,
        `lien ${assertion.linkId} raccorde`,
        `lien ${assertion.linkId} interrompu`,
      );
    }
    case 'service-status': {
      const node = world.network.node(assertion.nodeId);
      const service = node?.services.find(
        (s) => s.id === assertion.serviceId || s.name === assertion.serviceId,
      );
      if (!service)
        return fail(`service ${assertion.serviceId} introuvable sur ${assertion.nodeId}`);
      return service.status === assertion.status
        ? pass(`${service.name} est ${assertion.status}`)
        : fail(`${service.name} est ${service.status} au lieu de ${assertion.status}`);
    }
    case 'service-startup': {
      const node = world.network.node(assertion.nodeId);
      const service = node?.services.find(
        (s) => s.id === assertion.serviceId || s.name === assertion.serviceId,
      );
      if (!service) return fail(`service ${assertion.serviceId} introuvable`);
      return service.startupType === assertion.startupType
        ? pass(`${service.name} demarre en mode ${assertion.startupType}`)
        : fail(
            `${service.name} demarre en mode ${service.startupType} au lieu de ${assertion.startupType}`,
          );
    }
    case 'file-exists': {
      const system = world.systemState(assertion.systemId);
      const found = system?.files[assertion.path] !== undefined;
      return expected(
        assertion.expect,
        found,
        `${assertion.path} existe`,
        `${assertion.path} est absent de ${assertion.systemId}`,
      );
    }
    case 'file-matches': {
      const system = world.systemState(assertion.systemId);
      const node = system?.files[assertion.path];
      if (!node) return fail(`${assertion.path} est absent`);
      let regex: RegExp;
      try {
        regex = new RegExp(assertion.pattern, assertion.flags);
      } catch {
        return fail(`motif invalide : ${assertion.pattern}`);
      }
      return regex.test(node.content)
        ? pass(`${assertion.path} contient le motif attendu`)
        : fail(`${assertion.path} ne contient pas ${assertion.pattern}`);
    }
    case 'file-permissions': {
      const system = world.systemState(assertion.systemId);
      const node = system?.files[assertion.path];
      if (!node) return fail(`${assertion.path} est absent`);
      if (
        assertion.mode !== undefined &&
        node.permissions.mode.replace(/^0+/, '') !== assertion.mode.replace(/^0+/, '')
      ) {
        return fail(
          `${assertion.path} est en ${node.permissions.mode} au lieu de ${assertion.mode}`,
        );
      }
      if (assertion.owner !== undefined && node.permissions.owner !== assertion.owner) {
        return fail(
          `${assertion.path} appartient a ${node.permissions.owner} au lieu de ${assertion.owner}`,
        );
      }
      if (assertion.group !== undefined && node.permissions.group !== assertion.group) {
        return fail(
          `${assertion.path} a le groupe ${node.permissions.group} au lieu de ${assertion.group}`,
        );
      }
      return pass(`les droits de ${assertion.path} sont conformes`);
    }
    case 'user-exists': {
      const system = world.systemState(assertion.systemId);
      const found =
        system?.users.some((u) => u.name.toLowerCase() === assertion.user.toLowerCase()) ?? false;
      return expected(
        assertion.expect,
        found,
        `le compte ${assertion.user} existe`,
        `le compte ${assertion.user} est absent`,
      );
    }
    case 'user-in-group': {
      const system = world.systemState(assertion.systemId);
      const group = system?.groups.find(
        (g) => g.name.toLowerCase() === assertion.group.toLowerCase(),
      );
      const inGroup =
        group?.members.some((m) => m.toLowerCase() === assertion.user.toLowerCase()) ??
        system?.users
          .find((u) => u.name.toLowerCase() === assertion.user.toLowerCase())
          ?.groups.some((g) => g.toLowerCase() === assertion.group.toLowerCase()) ??
        false;
      return expected(
        assertion.expect,
        inGroup,
        `${assertion.user} appartient a ${assertion.group}`,
        `${assertion.user} n appartient pas a ${assertion.group}`,
      );
    }
    case 'user-enabled': {
      const system = world.systemState(assertion.systemId);
      const user = system?.users.find((u) => u.name.toLowerCase() === assertion.user.toLowerCase());
      if (!user) return fail(`le compte ${assertion.user} est absent`);
      return user.enabled === assertion.enabled
        ? pass(`${assertion.user} est ${assertion.enabled ? 'actif' : 'desactive'}`)
        : fail(
            `${assertion.user} est ${user.enabled ? 'actif' : 'desactive'} contrairement a l attendu`,
          );
    }
    case 'share-exists': {
      const system = world.systemState(assertion.systemId);
      const found =
        system?.shares.some(
          (s) => s.name.toLowerCase() === assertion.share.toLowerCase() && s.enabled,
        ) ?? false;
      return expected(
        assertion.expect,
        found,
        `le partage ${assertion.share} existe`,
        `le partage ${assertion.share} est absent ou desactive`,
      );
    }
    case 'process-running': {
      const system = world.systemState(assertion.systemId);
      const found =
        system?.processes.some((p) =>
          p.name.toLowerCase().includes(assertion.processName.toLowerCase()),
        ) ?? false;
      return expected(
        assertion.expect,
        found,
        `${assertion.processName} tourne`,
        `${assertion.processName} ne tourne pas`,
      );
    }
    case 'scheduled-task': {
      const system = world.systemState(assertion.systemId);
      const task = system?.scheduledTasks.find(
        (t) => t.name.toLowerCase() === assertion.taskName.toLowerCase(),
      );
      if (task === undefined) {
        return expected(assertion.expect, false, '', `la tache ${assertion.taskName} n existe pas`);
      }
      if (assertion.enabled !== undefined && task.enabled !== assertion.enabled) {
        return fail(
          `la tache ${assertion.taskName} est ${task.enabled ? 'activee' : 'desactivee'}`,
        );
      }
      return expected(assertion.expect, true, `la tache ${assertion.taskName} est configuree`, '');
    }
    case 'domain-joined': {
      const system = world.systemState(assertion.systemId);
      const joined =
        system?.domainJoin?.joined === true && system.domainJoin.domain === assertion.domain;
      return expected(
        assertion.expect,
        joined,
        `${assertion.systemId} est membre de ${assertion.domain}`,
        `${assertion.systemId} n est pas membre de ${assertion.domain}`,
      );
    }
    case 'vm-state': {
      const vm = world.virtualization.vm(assertion.vmId);
      if (!vm) return fail(`machine virtuelle ${assertion.vmId} introuvable`);
      return vm.state === assertion.state
        ? pass(`${vm.name} est ${assertion.state}`)
        : fail(`${vm.name} est ${vm.state} au lieu de ${assertion.state}`);
    }
    case 'ticket-status': {
      const ticket = world.itsm.ticket(assertion.ticketId);
      if (!ticket) return fail(`ticket ${assertion.ticketId} introuvable`);
      return ticket.status === assertion.status
        ? pass(`le ticket ${ticket.reference} est ${assertion.status}`)
        : fail(`le ticket ${ticket.reference} est ${ticket.status} au lieu de ${assertion.status}`);
    }
    case 'ticket-priority': {
      const ticket = world.itsm.ticket(assertion.ticketId);
      if (!ticket) return fail(`ticket ${assertion.ticketId} introuvable`);
      return ticket.priority === assertion.priority
        ? pass(`priorite ${assertion.priority} correcte`)
        : fail(`le ticket est en ${ticket.priority} au lieu de ${assertion.priority}`);
    }
    case 'ticket-documented': {
      const ticket = world.itsm.ticket(assertion.ticketId);
      if (!ticket) return fail(`ticket ${assertion.ticketId} introuvable`);
      const summary = ticket.resolutionSummary ?? '';
      if (summary.trim().length < assertion.minLength) {
        return fail(
          `la resolution du ticket ${ticket.reference} est trop succincte (${summary.trim().length} caracteres)`,
        );
      }
      if (assertion.requireRootCause && (ticket.rootCause ?? '').trim().length < 10) {
        return fail(`la cause racine du ticket ${ticket.reference} n est pas documentee`);
      }
      return pass(`le ticket ${ticket.reference} est documente`);
    }
    case 'backup-restorable': {
      const job = world.backup.job(assertion.jobId);
      if (!job) return fail(`tache de sauvegarde ${assertion.jobId} introuvable`);
      const last = job.points[job.points.length - 1];
      const ok = last !== undefined && world.backup.testRestore(job.id, last.id).ok;
      return expected(
        assertion.expect,
        ok,
        `la sauvegarde ${job.name} est restaurable`,
        `la sauvegarde ${job.name} n est pas restaurable`,
      );
    }
    case 'snapshot-taken': {
      const taken = world.bus.count(
        (e) =>
          e.type === 'virtualization.snapshot.taken' &&
          (assertion.targetId === undefined || e.payload.vmId === assertion.targetId),
      );
      return expected(
        assertion.expect,
        taken > 0,
        'un instantane a ete pris',
        'aucun instantane n a ete pris avant l intervention',
      );
    }
    case 'command-used': {
      let regex: RegExp;
      try {
        regex = new RegExp(assertion.pattern, 'i');
      } catch {
        return fail(`motif de commande invalide : ${assertion.pattern}`);
      }
      const count = world.bus.count((e) => {
        if (e.type !== 'terminal.command') return false;
        if (assertion.systemId !== undefined && e.payload.systemId !== assertion.systemId)
          return false;
        return regex.test(String(e.payload.command ?? ''));
      });
      return expected(
        assertion.expect,
        count >= assertion.minCount,
        `la commande attendue a ete utilisee (${count} fois)`,
        `aucune commande correspondant a "${assertion.pattern}" n a ete executee`,
      );
    }
    case 'unchanged': {
      if (!ctx.baseline) return pass('aucun etat de reference : verification ignoree');
      const before = baselineSlice(ctx, assertion.scope, assertion.targetId);
      const after = currentSlice(ctx, assertion.scope, assertion.targetId);
      if (before === undefined) return pass('element absent de l etat de reference');
      return hashObject(before) === hashObject(after)
        ? pass(`${assertion.targetId} est reste intact`)
        : fail(`${assertion.targetId} a ete modifie alors qu il etait hors perimetre`);
    }
    case 'event-occurred': {
      const found = world.bus.count((e) => e.type === assertion.eventType) > 0;
      return expected(
        assertion.expect,
        found,
        `evenement ${assertion.eventType} observe`,
        `evenement ${assertion.eventType} absent`,
      );
    }
    default: {
      const never: never = assertion;
      return fail(`type d assertion non gere : ${JSON.stringify(never)}`);
    }
  }
}

/** Evalue une assertion, y compris les compositions all / any / not. */
export function evaluateAssertion(assertion: Assertion, ctx: EvaluationContext): AssertionResult {
  if (assertion.type === 'all') {
    const children = assertion.of.map((a) => evaluateAssertion(a, ctx));
    const failed = children.filter((c) => !c.passed);
    return {
      passed: failed.length === 0,
      detail:
        failed.length === 0
          ? 'toutes les conditions sont remplies'
          : failed.map((f) => f.detail).join(' ; '),
      children,
    };
  }
  if (assertion.type === 'any') {
    const children = assertion.of.map((a) => evaluateAssertion(a, ctx));
    const succeeded = children.find((c) => c.passed);
    return {
      passed: succeeded !== undefined,
      detail:
        succeeded?.detail ??
        `aucune solution valide : ${children.map((c) => c.detail).join(' ; ')}`,
      children,
    };
  }
  if (assertion.type === 'not') {
    const inner = evaluateAssertion(assertion.of, ctx);
    return {
      passed: !inner.passed,
      detail: inner.passed
        ? `condition interdite verifiee : ${inner.detail}`
        : 'la condition interdite n est pas remplie',
      children: [inner],
    };
  }
  const result = evaluateLeaf(assertion, ctx);
  return assertion.note === undefined
    ? result
    : { ...result, detail: `${assertion.note} - ${result.detail}` };
}

export function assertionPasses(assertion: Assertion, ctx: EvaluationContext): boolean {
  return evaluateAssertion(assertion, ctx).passed;
}

/** Utilitaire de diagnostic : retrouve la route utilisee pour une destination. */
export function explainRoute(world: SimulationWorld, nodeId: string, destination: string): string {
  const node = world.network.node(nodeId);
  if (!node) return 'noeud introuvable';
  const route = lookupRoute(effectiveRoutes(node), destination);
  if (!route) return `aucune route vers ${destination}`;
  const iface = node.interfaces.find((i) => i.id === route.interfaceId);
  return `${route.destination} via ${route.via ?? 'lien direct'} sur ${iface?.name ?? '?'} (${route.origin})`;
}
