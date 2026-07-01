import { describe, expect, it } from 'bun:test';

import {
  findDevtoolsCommandByPath,
  getDevtoolsCommand,
  getDevtoolsCommands,
} from './devtoolsCommands.js';

describe('devtools command table', () => {
  it('defines the exact provider-backed command surface', () => {
    const commands = getDevtoolsCommands();

    expect(commands).toEqual([
      {
        path: ['lint'],
        capability: 'devtools.lint',
        summary: 'Run the shared ESLint toolchain.',
        packageName: 'eslint',
        binName: 'eslint',
      },
      {
        path: ['format'],
        capability: 'devtools.format',
        summary: 'Run the shared Prettier toolchain.',
        packageName: 'prettier',
        binName: 'prettier',
      },
      {
        path: ['knip'],
        capability: 'devtools.knip',
        summary: 'Run the shared Knip toolchain.',
        packageName: 'knip',
        binName: 'knip',
      },
    ]);
  });

  it('returns commands by path and rejects unknown commands', () => {
    expect(getDevtoolsCommand('lint').path).toEqual(['lint']);
    expect(findDevtoolsCommandByPath(['format'])?.capability).toBe('devtools.format');
    expect(findDevtoolsCommandByPath(['unknown'])).toBeNull();
    expect(findDevtoolsCommandByPath(['lint', 'extra'])).toBeNull();
  });
});
