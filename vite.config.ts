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
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/client',
        'react-router-dom',
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities',
        '@hookform/resolvers/zod',
        '@yudiel/react-qr-scanner',
        'clsx',
        'date-fns',
        'date-fns/locale',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/functions',
        'firebase/analytics',
        'firebase/storage',
        'html-to-image',
        'html2canvas',
        'html5-qrcode',
        'i18next',
        'idb',
        'jspdf',
        'jspdf-autotable',
        'jsqr',
        'lucide-react',
        'motion',
        'motion/react',
        'papaparse',
        'qrcode.react',
        'react-hook-form',
        'react-i18next',
        'react-is',
        'react-to-print',
        'recharts',
        'sonner',
        'tailwind-merge',
        'xlsx',
        'zod'
      ],
      entries: [
        './index.html'
      ],
      exclude: [
        'firebase-admin'
      ]
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
        'react': path.resolve(process.cwd(), './node_modules/react'),
        'react-dom': path.resolve(process.cwd(), './node_modules/react-dom'),
      },
      dedupe: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities'
      ],
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
