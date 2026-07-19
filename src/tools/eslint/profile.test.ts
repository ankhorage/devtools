import { expect, test } from 'bun:test';

import { resolveEslintProfileFromDetectionInput } from './profile.js';

test('selects the base profile for plain TypeScript projects', () => {
  expect(
    resolveEslintProfileFromDetectionInput('auto', {
      devDependencies: { typescript: '^5.9.3' },
    }),
  ).toBe('base');
});

test('selects the React profile for React and Next.js projects', () => {
  expect(
    resolveEslintProfileFromDetectionInput('auto', {
      peerDependencies: { react: '^19.0.0' },
    }),
  ).toBe('react');
  expect(
    resolveEslintProfileFromDetectionInput('auto', {
      dependencies: { next: '^16.0.0' },
    }),
  ).toBe('react');
});

test('gives React Native and Expo precedence over React', () => {
  expect(
    resolveEslintProfileFromDetectionInput('auto', {
      dependencies: { react: '^19.0.0', 'react-native': '^0.81.0' },
    }),
  ).toBe('react-native');
  expect(
    resolveEslintProfileFromDetectionInput('auto', {
      dependencies: { expo: '^56.0.0' },
    }),
  ).toBe('react-native');
});

test('honors an explicit profile override', () => {
  expect(
    resolveEslintProfileFromDetectionInput('base', {
      dependencies: { expo: '^56.0.0' },
    }),
  ).toBe('base');
});
