import { describe, expect, it } from 'bun:test';

import {
  findDevtoolsCommandByPath,
  getDevtoolsCommand,
  getDevtoolsCommands,
} from './devtoolsCommands.js';

describe('devtools command table', () => {
  it('defines the canonical provider-backed command paths', () => {
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

  it('returns binary commands by tool name', () => {
    expect(getDevtoolsCommand('lint').path).toEqual(['lint']);
    expect(getDevtoolsCommand('format').binName).toBe('prettier');
    expect(getDevtoolsCommand('knip').packageName).toBe('knip');
  });

  it('resolves nested managed commands and rejects unknown paths', () => {
    expect(findDevtoolsCommandByPath(['workflows', 'sync'])?.capability).toBe(
      'devtools.workflows.sync',
    );
    expect(findDevtoolsCommandByPath(['vscode', 'status'])?.capability).toBe(
      'devtools.vscode.status',
    );
    expect(findDevtoolsCommandByPath(['unknown'])).toBeNull();
    expect(findDevtoolsCommandByPath(['lint', 'extra'])).toBeNull();
  });
});
