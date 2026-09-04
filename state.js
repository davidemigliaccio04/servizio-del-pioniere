// ============================================================================
// state.js
// Un unico oggetto "state" mutabile con tutti i dati dell'app in memoria.
// E' volutamente semplice (niente framework): gli altri moduli lo importano
// e lo leggono/modificano direttamente, poi richiamano le funzioni di
// render.js per aggiornare lo schermo.
// ============================================================================

import { DEFAULT_SETTINGS } from './constants.js';
import { firstDayOfCurrentMonth } from './utils.js';

export const state = {
  // BUG RISOLTO: prima era `new Date(2026, 7, 1)`, una data fissa. Passato
  // agosto 2026 l'app si sarebbe sempre aperta su quel mese invece che su
  // quello reale. Ora partiamo sempre dal primo giorno del mese corrente.
  current: firstDayOfCurrentMonth(),

  entries: [],   // [{ id, entry_date:'YYYY-MM-DD', entry_type:'service'|'work', minutes, created_at, _pendingSync? }]
  goals: {},     // { 'YYYY-MM' (anno solare): minutiObiettivo }
  studies: {},   // { 'YYYY-MM' (anno solare): numeroStudi }
  settings: { ...DEFAULT_SETTINGS },

  user: null,    // utente Supabase autenticato, o null in modalita' locale

  // Stato del modale di inserimento ore
  entryType: 'service',
  entryDate: null,
  editingEntryId: null,
  hourValue: 1,
  minuteValue: 30
};

/**
 * Riporta lo stato utente/dati ai valori di default. Usata al logout: prima
 * questo passaggio mancava e, su un dispositivo condiviso, dopo essere
 * usciti restavano visibili a schermo le ore dell'account precedente finche'
 * non si ricaricava manualmente la pagina (bug di privacy).
 */
export function resetUserState() {
  state.user = null;
  state.entries = [];
  state.goals = {};
  state.studies = {};
  state.settings = { ...DEFAULT_SETTINGS };
  state.editingEntryId = null;
}
