#!/usr/bin/env node

import { runStandaloneTool } from '../runStandaloneTool.js';

const result = await runStandaloneTool('lint', process.argv.slice(2));
process.exit(result.exitCode);
