import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'services/**/*.js',
        'controllers/**/*.js',
        'middleware/**/*.js',
        'routes/**/*.js'
      ],
      exclude: [
        'node_modules/**',
        '**/*.test.js',
        'mcp-servers/**',
        'scripts/**'
      ]
    }
  }
});
