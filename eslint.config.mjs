import next from 'eslint-config-next';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.data/**',
      // The Roblox prototype this repository previously held. Not part of this app.
      'src/**',
    ],
  },
  ...next,
];

export default config;
