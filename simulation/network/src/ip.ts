/** Arithmetique IPv4 exacte, base de tout le moteur reseau. */

export function ipToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`Adresse IPv4 invalide : ${ip}`);
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      throw new Error(`Adresse IPv4 invalide : ${ip}`);
    }
    value = (value * 256 + octet) >>> 0;
  }
  return value >>> 0;
}

export function intToIp(value: number): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
}

export function prefixToMaskInt(prefix: number): number {
  if (prefix < 0 || prefix > 32) throw new Error(`Prefixe invalide : /${prefix}`);
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMask(prefix: number): string {
  return intToIp(prefixToMaskInt(prefix));
}

export function maskToPrefix(mask: string): number {
  const value = ipToInt(mask);
  let prefix = 0;
  let seenZero = false;
  for (let bit = 31; bit >= 0; bit -= 1) {
    const isOne = ((value >>> bit) & 1) === 1;
    if (isOne) {
      if (seenZero) throw new Error(`Masque non contigu : ${mask}`);
      prefix += 1;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

export interface Cidr {
  networkInt: number;
  prefix: number;
}

export function parseCidr(cidr: string): Cidr {
  const [addr, prefixText] = cidr.split('/');
  if (addr === undefined || prefixText === undefined) throw new Error(`CIDR invalide : ${cidr}`);
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`CIDR invalide : ${cidr}`);
  return { networkInt: (ipToInt(addr) & prefixToMaskInt(prefix)) >>> 0, prefix };
}

export function formatCidr(cidr: Cidr): string {
  return `${intToIp(cidr.networkInt)}/${cidr.prefix}`;
}

export function networkOf(ip: string, prefix: number): string {
  return intToIp((ipToInt(ip) & prefixToMaskInt(prefix)) >>> 0);
}

export function broadcastOf(ip: string, prefix: number): string {
  return intToIp((ipToInt(ip) | (~prefixToMaskInt(prefix) >>> 0)) >>> 0);
}

export function inCidr(ip: string, cidr: string): boolean {
  const { networkInt, prefix } = parseCidr(cidr);
  return ((ipToInt(ip) & prefixToMaskInt(prefix)) >>> 0) === networkInt;
}

export function sameSubnet(a: string, b: string, prefix: number): boolean {
  const mask = prefixToMaskInt(prefix);
  return ((ipToInt(a) & mask) >>> 0) === ((ipToInt(b) & mask) >>> 0);
}

/** Adresses utilisables d un sous-reseau (hors reseau et broadcast, sauf /31 et /32). */
export function usableRange(cidr: string): { first: string; last: string; count: number } {
  const { networkInt, prefix } = parseCidr(cidr);
  const size = prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
  const firstInt = prefix >= 31 ? networkInt : networkInt + 1;
  const lastInt = prefix >= 31 ? networkInt + 2 ** (32 - prefix) - 1 : networkInt + 2 ** (32 - prefix) - 2;
  return { first: intToIp(firstInt), last: intToIp(lastInt), count: size };
}

export function isSpecial(ip: string): 'loopback' | 'apipa' | 'multicast' | 'broadcast' | 'private' | 'public' {
  const v = ipToInt(ip);
  if (v === 0xffffffff) return 'broadcast';
  if (inCidr(ip, '127.0.0.0/8')) return 'loopback';
  if (inCidr(ip, '169.254.0.0/16')) return 'apipa';
  if (v >= ipToInt('224.0.0.0') && v <= ipToInt('239.255.255.255')) return 'multicast';
  if (inCidr(ip, '10.0.0.0/8') || inCidr(ip, '172.16.0.0/12') || inCidr(ip, '192.168.0.0/16')) return 'private';
  return 'public';
}

export function isValidIpv4(ip: string): boolean {
  try {
    ipToInt(ip);
    return true;
  } catch {
    return false;
  }
}

/** Compare deux adresses ; utile pour trier les tables de routage de facon deterministe. */
export function compareIp(a: string, b: string): number {
  return ipToInt(a) - ipToInt(b);
}
