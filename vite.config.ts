/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// base './' ＝ Capacitor（file:// で開く）でも GitHub Pages（サブパス）でも同じ dist が動く
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  test: { include: ['test/**/*.test.ts'] },
});
