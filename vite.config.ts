import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Static SPA — hosted on Vercel with zero serverless functions (free-tier friendly).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    sourcemap: false,
    // Keep the vendor bundle lean; Supabase client is the only heavy dep.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
