export default {
  base: './', 
  server: {
    host: true // or '0.0.0.0'
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'ndsp-chamber.js',
        chunkFileNames: 'ndsp-chamber-chunk.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'ndsp-chamber.css';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
};
