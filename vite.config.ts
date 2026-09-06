import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities',
        'xlsx',
        'html5-qrcode',
        'jspdf',
        'html2canvas',
        'date-fns',
        'recharts',
        'lucide-react',
        'motion',
        'motion/react',
        'sonner',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/functions'
      ]
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
      dedupe: ['react', 'react-dom', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
            'vendor-charts': ['recharts'],
            'vendor-lucide': ['lucide-react'],
            'vendor-motion': ['motion'],
            'vendor-jspdf': ['jspdf', 'html2canvas'],
            'vendor-excel': ['xlsx']
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
