import { describe, expect, it } from 'bun:test';

import {
  findDevtoolsCommandByPath,
  getDevtoolsCommands,
  getDevtoolsToolCommand,
} from './commands.js';

describe('devtools command table', () => {
  it('defines the exact provider-backed command surface', () => {
    expect(getDevtoolsCommands().map((command) => command.path.join(' '))).toEqual([
      'lint',
      'format',
      'knip',
      'sync',
      'status',
      'workflows sync',
      'workflows status',
      'vscode sync',
      'vscode status',
    ]);
  });

  it('resolves single- and multi-segment command paths', () => {
    expect(getDevtoolsToolCommand('lint').capability).toBe('devtools.lint');
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
