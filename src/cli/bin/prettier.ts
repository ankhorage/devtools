#!/usr/bin/env node

import { runStandaloneTool } from '../runStandaloneTool.js';

const result = await runStandaloneTool('format', process.argv.slice(2));
process.exit(result.exitCode);
