import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/proxy/rag':      { target: 'http://localhost:8001', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/rag/, '') },
      '/proxy/qdrant':   { target: 'http://localhost:6333', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/qdrant/, '') },
      '/proxy/camel':    { target: 'http://localhost:8090', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/camel/, '') },
      '/proxy/backstage':{ target: 'http://localhost:7007', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/backstage/, '') },
      '/proxy/litellm':  { target: 'http://localhost:4000', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/litellm/, '') },
      '/proxy/langfuse': { target: 'http://localhost:3002', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/langfuse/, '') },
      '/proxy/grafana':  { target: 'http://localhost:3001', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/grafana/, '') },
      '/proxy/minio':    { target: 'http://localhost:9000', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/minio/, '') },
      '/proxy/kong':     { target: 'http://localhost:8002', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/kong/, '') },
      '/proxy/keycloak': { target: 'http://localhost:8080', changeOrigin: true, rewrite: p => p.replace(/^\/proxy\/keycloak/, '') },
    },
  },
})
