import type { SystemState } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import type { NetworkEngine } from '@tssr/sim-network';
import type { SystemEngine } from '../engine.ts';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function output(stdout: string, exitCode = 0): CommandResult {
  return { stdout, stderr: '', exitCode };
}

export function failure(stderr: string, exitCode = 1): CommandResult {
  return { stdout: '', stderr, exitCode };
}

export interface ShellSessionState {
  cwd: string;
  user: string;
  env: Record<string, string>;
  history: string[];
}

export interface ShellContext {
  system: SystemState;
  systems: SystemEngine;
  network: NetworkEngine;
  session: ShellSessionState;
  bus?: EventBus;
  /** Acces aux autres systemes pour les operations a distance (SSH, WinRM). */
  lookupSystem?: (networkNodeId: string) => SystemEngine | undefined;
}

export interface CommandSpec {
  name: string;
  /** Resume affiche par l aide : la liste reflete exactement ce qui est implemente. */
  summary: string;
  usage: string;
  aliases?: string[];
  run: (args: string[], ctx: ShellContext, stdin: string) => CommandResult;
}

/** Decoupage en respectant les guillemets simples et doubles. */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current !== '') tokens.push(current);
  return tokens;
}

export interface ParsedSegment {
  tokens: string[];
  redirect?: { path: string; append: boolean };
}

/** Analyse une ligne : segments separes par "|", redirection ">" ou ">>" en fin de ligne. */
export function parseLine(line: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  for (const part of line.split('|')) {
    const tokens = tokenize(part.trim());
    const segment: ParsedSegment = { tokens };
    const redirectIndex = tokens.findIndex((t) => t === '>' || t === '>>');
    if (redirectIndex !== -1) {
      const path = tokens[redirectIndex + 1];
      if (path !== undefined) {
        segment.redirect = { path, append: tokens[redirectIndex] === '>>' };
      }
      segment.tokens = tokens.slice(0, redirectIndex);
    }
    segments.push(segment);
  }
  return segments;
}

export interface FlagSet {
  flags: Set<string>;
  options: Map<string, string>;
  positional: string[];
}

/** Analyse simple des arguments : -a, -la, --long, --long=valeur. */
export function parseArgs(args: string[]): FlagSet {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (key === undefined) continue;
      if (value === undefined) flags.add(key);
      else options.set(key, value);
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (const char of arg.slice(1)) flags.add(char);
    } else {
      positional.push(arg);
    }
  }
  return { flags, options, positional };
}

export function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

export function table(rows: string[][], gap = 2): string {
  if (rows.length === 0) return '';
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => (i === row.length - 1 ? cell : padRight(cell, widths[i] ?? 0)))
        .join(' '.repeat(gap))
        .trimEnd(),
    )
    .join('\n');
}
