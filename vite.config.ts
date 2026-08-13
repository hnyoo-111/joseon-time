import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import * as cesiumPluginModule from 'vite-plugin-cesium'
import path from 'node:path'

// vite-plugin-cesium's CJS/ESM dual-package types resolve as a non-callable namespace under
// this project's TS settings — cast to the plugin's actual runtime shape to sidestep it.
const cesium = (cesiumPluginModule as unknown as { default: (options?: Record<string, unknown>) => Plugin }).default

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 프로젝트 사이트(https://<user>.github.io/joseon-time/) 배포 시
  // CI에서 BASE_PATH=/joseon-time/ 로 주입한다. 로컬/루트 배포는 '/' 그대로.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
