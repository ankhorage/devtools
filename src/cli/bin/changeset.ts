#!/usr/bin/env node

import { runChangesetAsync } from '../runChangesetAsync.js';

const result = await runChangesetAsync(process.argv.slice(2));
process.exit(result.exitCode);
