import { describe, expect, it } from 'bun:test';

import provider from './cli/index.js';
import { getDevtoolsCommands } from './internal/devtoolsCommands.js';

describe('devtools package provider', () => {
  it('exposes only the shipped devtools commands and capabilities', () => {
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
      'lint',
      'format',
      'knip',
    ]);
  });

  it('binds exactly one handler for every command descriptor', () => {
    const { handlers } = provider;
    const handlerPaths = handlers.map((handler) => handler.path.join(' ')).sort();
    const commandPaths = provider.commands.map((command) => command.path.join(' ')).sort();

    expect(handlerPaths).toEqual(commandPaths);
    expect(new Set(handlerPaths).size).toBe(handlerPaths.length);
  });
});
