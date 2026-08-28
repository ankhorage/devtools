import { describe, expect, it } from 'bun:test';

import { getDevtoolsCommands } from './cli/commands.js';
import provider from './cli/index.js';

describe('devtools package provider', () => {
  it('exposes the complete canonical devtools command surface', () => {
    const commands = getDevtoolsCommands();

    expect(provider.id).toBe('@ankhorage/devtools');
    expect(provider.category).toBe('devtools');
    expect(provider.capabilities).toEqual(commands.map((command) => command.capability));
    expect(provider.commands).toEqual(
      commands.map((command) => ({
        path: [...command.path],
        capability: command.capability,
        summary: command.summary,
      })),
    );
    expect(provider.commands.map((command) => command.path.join(' '))).toEqual([
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

  it('binds exactly one handler for every command descriptor', () => {
    const handlerPaths = provider.handlers.map((handler) => handler.path.join(' ')).sort();
    const commandPaths = provider.commands.map((command) => command.path.join(' ')).sort();

    expect(handlerPaths).toEqual(commandPaths);
    expect(new Set(handlerPaths).size).toBe(handlerPaths.length);
  });
});
