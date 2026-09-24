# Repaso

Tarjetas de estudio con repetición espaciada (FSRS). App web instalable en el móvil (PWA), funciona sin conexión y guarda todo en el dispositivo.

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173 (también accesible desde el móvil en la misma red)
npm run build    # genera dist/ para publicar en cualquier hosting estático
```

- `src/lib/db.ts` — base de datos local (IndexedDB con Dexie)
- `src/lib/srs.ts` — planificación de repasos con `ts-fsrs`
- `src/lib/importers.ts` — importación de CSV, Anki (.apkg) y copias de seguridad
- `src/lib/tts.ts` — pronunciación con la voz del sistema
