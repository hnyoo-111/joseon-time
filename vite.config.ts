import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import * as cesiumPluginModule from 'vite-plugin-cesium'
import path from 'node:path'

// vite-plugin-cesium's CJS/ESM dual-package types resolve as a non-callable namespace under
// this project's TS settings — cast to the plugin's actual runtime shape to sidestep it.
const cesium = (cesiumPluginModule as unknown as { default: (options?: Record<string, unknown>) => Plugin }).default

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
