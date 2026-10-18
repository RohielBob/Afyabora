import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  // html5-qrcode (scan du QR, L5-10) n'est chargé qu'à la demande (import dynamique). On le prépare dès le
  // démarrage du serveur de développement : découvert en cours de route, Vite le reconstruisait pendant
  // qu'une page l'utilisait, et la caméra ne lisait plus aucun QR (vu en vérification, jamais en build).
  optimizeDeps: { include: ['html5-qrcode'] },
});
