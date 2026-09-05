import next from 'eslint-config-next';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.data/**',
    ],
  },
  ...next,
];

export default config;
