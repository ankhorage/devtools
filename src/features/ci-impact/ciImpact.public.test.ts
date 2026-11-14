import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { CiImpactWorkflowOutput } from '../../ci-impact.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

test('packed consumers can typecheck the public interface and receive GitHub Actions decisions', async () => {
  const consumerDirectory = await createPackedConsumer();
  exec(consumerDirectory, ['install']);
  typecheckConsumer(consumerDirectory);

  const runtime = JSON.parse(exec(consumerDirectory, ['consumer.ts'])) as CiImpactWorkflowOutput;
  expect(runtime.jobs['test:e2e:account'].state).toBe('selected');
  expect(runtime.jobs['test:e2e:catalog'].state).toBe('skipped');

  const outputPath = join(consumerDirectory, 'github-output');
  exec(consumerDirectory, ['./node_modules/.bin/ankhorage-ci-impact', 'plan'], {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_OUTPUT: outputPath,
  });
  const githubOutput = await readFile(outputPath, 'utf8');
  const impact = JSON.parse(
    /^impact=(.+)$/mu.exec(githubOutput)?.[1] ?? '',
  ) as CiImpactWorkflowOutput;
  expect(impact.jobs['test:e2e:account']).toEqual({
    state: 'full',
    reason: 'Unsafe or unavailable diff',
    fallback: true,
  });
}, 120_000);

async function createPackedConsumer(): Promise<string> {
  const packageDirectory = await mkdtemp(join(tmpdir(), 'devtools-ci-impact-package-'));
  const consumerDirectory = await mkdtemp(join(tmpdir(), 'devtools-ci-impact-consumer-'));
  directories.push(packageDirectory, consumerDirectory);
  exec(process.cwd(), ['pm', 'pack', '--destination', packageDirectory]);
  const archive = (await readdir(packageDirectory)).find((entry) => entry.endsWith('.tgz'));
  if (archive === undefined) throw new Error('Expected a packed Devtools archive.');
  await writeFile(
    join(consumerDirectory, 'package.json'),
    consumerManifest(packageDirectory, archive),
  );
  await writeFile(join(consumerDirectory, 'consumer.ts'), consumerSource);
  return consumerDirectory;
}

function consumerManifest(packageDirectory: string, archive: string): string {
  return (
    JSON.stringify({
      name: '@example/ci-impact-consumer',
      private: true,
      version: '1.0.0',
      scripts: consumerScripts,
      ankh: { ciImpact: consumerConfiguration },
      devDependencies: { '@ankhorage/devtools': `file:${join(packageDirectory, archive)}` },
    }) + '\n'
  );
}

function typecheckConsumer(consumerDirectory: string): void {
  exec(consumerDirectory, [
    './node_modules/.bin/tsc',
    '--noEmit',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ESNext',
    'consumer.ts',
  ]);
}

const consumerScripts = {
  'test:e2e:account': 'bun test',
  'test:e2e:catalog': 'bun test',
  'test:smoke:account': 'bun test',
};

const consumerConfiguration = {
  complete: { e2e: true, smoke: true },
  suites: [
    { kind: 'e2e' as const, script: 'test:e2e:account', paths: ['src/account/**'] },
    { kind: 'e2e' as const, script: 'test:e2e:catalog', paths: ['src/catalog/**'] },
    { kind: 'smoke' as const, script: 'test:smoke:account', paths: ['src/account/**'] },
  ],
};

const consumerSource = `import {
  createCiImpactWorkflowOutput,
  planCiImpact,
  type CiImpactWorkflowOutput,
} from '@ankhorage/devtools/ci-impact';

const scripts = {
  'test:e2e:account': 'bun test',
  'test:e2e:catalog': 'bun test',
  'test:smoke:account': 'bun test',
};
const configuration = {
  complete: { e2e: true, smoke: true },
  suites: [
    { kind: 'e2e' as const, script: 'test:e2e:account', paths: ['src/account/**'] },
    { kind: 'e2e' as const, script: 'test:e2e:catalog', paths: ['src/catalog/**'] },
    { kind: 'smoke' as const, script: 'test:smoke:account', paths: ['src/account/**'] },
  ],
};
const output: CiImpactWorkflowOutput = createCiImpactWorkflowOutput(
  planCiImpact(['src/account/login.ts'], scripts, configuration, 'a'.repeat(40)),
  configuration,
);
console.log(JSON.stringify(output));
`;

/*** Run a consumer command with the caller's environment plus explicit GitHub Actions variables. */
function exec(
  directory: string,
  args: readonly string[],
  environment: Record<string, string> = {},
): string {
  return execFileSync('bun', args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}
