import type { FirewallRule, NetworkNode } from '@tssr/contracts';
import { inCidr } from './ip.ts';

export type FirewallDirection = 'in' | 'out' | 'forward';

export interface PacketDescriptor {
  source: string;
  destination: string;
  protocol: 'icmp' | 'tcp' | 'udp';
  destinationPort?: number;
}

export interface FirewallDecision {
  allowed: boolean;
  rule?: FirewallRule;
  /** Vrai lorsque aucune regle n a filtre : politique implicite d autorisation. */
  implicit: boolean;
}

function matches(
  rule: FirewallRule,
  packet: PacketDescriptor,
  direction: FirewallDirection,
): boolean {
  if (!rule.enabled) return false;
  if (rule.direction !== direction) return false;
  if (rule.protocol !== 'any' && rule.protocol !== packet.protocol) return false;
  if (rule.source !== 'any' && !inCidr(packet.source, rule.source)) return false;
  if (rule.destination !== 'any' && !inCidr(packet.destination, rule.destination)) return false;
  if (rule.destinationPort !== undefined && rule.destinationPort !== packet.destinationPort)
    return false;
  return true;
}

/**
 * Evaluation premiere-regle-gagnante, dans l ordre declare.
 * Politique implicite : autoriser. Un pare-feu qui doit tout bloquer declare
 * explicitement sa regle finale de refus, pour que le joueur puisse la lire et la diagnostiquer.
 */
export function evaluateFirewall(
  node: NetworkNode,
  packet: PacketDescriptor,
  direction: FirewallDirection,
): FirewallDecision {
  const rules = [...node.firewallRules].sort((a, b) => a.order - b.order);
  for (const rule of rules) {
    if (matches(rule, packet, direction)) {
      return { allowed: rule.action === 'allow', rule, implicit: false };
    }
  }
  return { allowed: true, implicit: true };
}
