import { defineConfig } from 'vitest/config'

export default defineConfig({
  // GitHub Pages 项目页部署在子路径下，使用相对路径避免资源 404
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
