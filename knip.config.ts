import { createKnipConfig } from './src/knip.js';

export default createKnipConfig({
  entry: ['src/eslint.ts', 'src/knip.ts'],
});
