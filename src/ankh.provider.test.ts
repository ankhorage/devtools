import { describe, expect, it } from 'bun:test';

import { CAPABILITIES } from './capabilities/index.js';
import { getDevtoolsCommands } from './cli/commands.js';
import provider from './cli/index.js';

const EXPECTED_COMMAND_PATHS = [
  'apm sync',
  'apm validate',
  'structure build',
  'structure check',
  'changeset',
  'lint',
  'format',
  'knip',
  'sync',
  'status',
  'agents sync',
  'agents status',
  'skills sync',
  'skills status',
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
];

describe('devtools package provider', () => {
  it('exposes the complete canonical devtools command surface', testCanonicalCommandSurface);
  it('binds exactly one handler for every command descriptor', testHandlerParity);
});

function testCanonicalCommandSurface(): void {
  const commands = getDevtoolsCommands();

  expect(provider.id).toBe('@ankhorage/devtools');
  expect(provider.category).toBe('devtools');
  expect(provider.capabilities).toEqual(CAPABILITIES);
  expect(new Set(commands.map((command) => command.capability))).toEqual(
    new Set(CAPABILITIES.map((capability) => capability.id)),
  );
  expect(provider.commands).toEqual(
    commands.map((command) => ({
      path: [...command.path],
      capability: command.capability,
      summary: command.summary,
    })),
  );
  expect(provider.commands.map((command) => command.path.join(' '))).toEqual(
    EXPECTED_COMMAND_PATHS,
  );
}

function testHandlerParity(): void {
  const handlerPaths = provider.handlers.map((handler) => handler.path.join(' ')).sort();
  const commandPaths = provider.commands.map((command) => command.path.join(' ')).sort();

  expect(handlerPaths).toEqual(commandPaths);
  expect(new Set(handlerPaths).size).toBe(handlerPaths.length);
}
