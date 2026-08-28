import { synchronizeRenovateOwnerAsync } from '../src/owner/synchronizeRenovateOwnerAsync.js';

async function main(): Promise<void> {
  const [operation, targetDirectory, ...unexpected] = process.argv.slice(2);
  if (
    (operation !== 'status' && operation !== 'sync') ||
    targetDirectory === undefined ||
    unexpected.length > 0
  ) {
    throw new Error('Usage: bun scripts/sync-renovate-owner.ts <sync|status> <target-directory>');
  }

  await synchronizeRenovateOwnerAsync(operation, targetDirectory);
  console.log(`Devtools Renovate owner ${operation} is current.`);
}

await main();
