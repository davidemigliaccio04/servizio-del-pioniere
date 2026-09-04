// ============================================================================
// main.js
// Punto di ingresso: carica i dati (locali e poi remoti), disegna la prima
// schermata, collega gli eventi e resta in ascolto di connessione/scollegamento
// per la sincronizzazione differita. Caricato con <script type="module">.
// ============================================================================

import { render, toast } from './render.js';
import { loadLocal, loadRemote, flushPendingSync, setRealtimeChangeHandler } from './storage.js';
import { setupEvents } from './events.js';

async function start() {
  loadLocal();      // 1. mostra subito eventuali dati salvati sul dispositivo
  render();
  setupEvents();

  await loadRemote(); // 2. se c'e' una sessione Supabase attiva, sovrascrive/migra i dati
  render();
  setRealtimeChangeHandler(render);

  // NOVITA': quando la connessione torna disponibile, proviamo a inviare al
  // cloud gli inserimenti fatti offline (vedi storage.js -> saveTimeEntry).
  window.addEventListener('online', async () => {
    const synced = await flushPendingSync();
    if (synced) {
      render();
      toast('Dati sincronizzati');
    }
  });
}

start();
