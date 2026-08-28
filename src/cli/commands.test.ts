import { describe, expect, it } from 'bun:test';

import {
  findDevtoolsCommandByPath,
  getDevtoolsCommands,
  getDevtoolsToolCommand,
} from './commands.js';

describe('devtools command table', () => {
  it('defines the exact provider-backed command surface', () => {
    expect(getDevtoolsCommands().map((command) => command.path.join(' '))).toEqual([
      'changeset',
      'lint',
      'format',
      'knip',
      'sync',
      'status',
      'eslint sync',
      'eslint status',
      'prettier sync',
      'prettier status',
      'knip sync',
      'knip status',
      'package sync',
      'package status',
      'workflows sync',
      'workflows status',
      'vscode sync',
      'vscode status',
    ]);
  });

  it('resolves single- and multi-segment command paths', () => {
    expect(getDevtoolsToolCommand('changeset')).toMatchObject({
      capability: 'devtools.changeset',
      packageName: '@changesets/cli',
      binName: 'changeset',
    });
    expect(getDevtoolsToolCommand('lint').capability).toBe('devtools.lint');
    expect(findDevtoolsCommandByPath(['eslint', 'sync'])?.capability).toBe('devtools.eslint.sync');
    expect(findDevtoolsCommandByPath(['package', 'status'])?.capability).toBe(
      'devtools.package.status',
    );
    expect(findDevtoolsCommandByPath(['workflows', 'sync'])?.capability).toBe(
      'devtools.workflows.sync',
    );
    expect(findDevtoolsCommandByPath(['vscode', 'status'])?.capability).toBe(
      'devtools.vscode.status',
    );
    expect(findDevtoolsCommandByPath(['dev', 'sync'])).toBeNull();
    expect(findDevtoolsCommandByPath(['workflows'])).toBeNull();
  });
});
