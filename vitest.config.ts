import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './config/aliases.ts';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'core/**/*.test.ts',
      'simulation/**/*.test.ts',
      'nova/**/*.test.ts',
      'knowledge/**/*.test.ts',
      'modules/**/*.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
    ],
    // Les tests d interface ont besoin d un DOM ; les moteurs n en veulent pas.
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['tests/ui/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['core/**/src/**', 'simulation/**/src/**', 'nova/src/**', 'knowledge/src/**'],
    },
  },
});
