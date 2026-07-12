#!/usr/bin/env node

import { runStandaloneDevtoolsCommand } from '../../internal/runStandaloneDevtoolsCommand.js';

const result = await runStandaloneDevtoolsCommand('knip', process.argv.slice(2));
process.exit(result.exitCode);
