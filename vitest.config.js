import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/test/**/*.test.js', 'services/**/test/**/*.test.js'] },
});
