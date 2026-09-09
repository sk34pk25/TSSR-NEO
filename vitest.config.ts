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
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['core/**/src/**', 'simulation/**/src/**', 'nova/src/**', 'knowledge/src/**'],
    },
  },
});
