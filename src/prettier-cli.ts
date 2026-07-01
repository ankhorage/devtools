#!/usr/bin/env node

import { runStandaloneDevtoolsCommand } from './internal/runStandaloneDevtoolsCommand.js';

const result = await runStandaloneDevtoolsCommand('format', process.argv.slice(2));
process.exit(result.exitCode);
