import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // 이 프로젝트 전용 포트. 5173은 다른 로컬 프로젝트와 공용이라, 그쪽에서 등록해 둔
  // 서비스워커가 같은 origin(localhost:5173)의 요청을 가로채 남의 앱을 띄우는 사고가 난다.
  server: { port: 5273, strictPort: true },
  preview: { port: 4273, strictPort: true },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.qa-chrome-*/**'
    ]
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600
  }
});
