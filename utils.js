// ============================================================================
// utils.js
// Funzioni "pure": non toccano lo stato globale né il DOM (tranne $, che è
// solo una scorciatoia per document.getElementById). Sono le stesse per
// qualunque schermata, quindi vivono in un file a parte e vengono importate
// ovunque servano.
// ============================================================================

/** Scorciatoia per document.getElementById. */
export const $ = (id) => document.getElementById(id);

/** Aggiunge uno zero davanti ai numeri < 10 (5 -> "05"). */
export const pad = (n) => String(n).padStart(2, '0');

/** Converte un numero di minuti in formato leggibile "H:MM" (es. 95 -> "1:35"). */
export const minutesToTime = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;

/** Formatta una Date in chiave "YYYY-MM-DD" usando l'ora locale (non UTC!). */
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Formatta una Date in chiave mese "YYYY-MM" (anno solare, non anno di servizio). */
export const keyFor = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/**
 * Riporta un numero dentro un intervallo [min, max], con un valore di
 * fallback se l'input non è un numero valido. Usata per validare gli input
 * numerici delle impostazioni, dato che senza un tag <form> il browser non
 * applica da solo i vincoli "min"/"type=number" scritti in HTML.
 */
export function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Rende sicura una stringa prima di inserirla via innerHTML, sostituendo i
 * caratteri speciali HTML. Si usa per i campi personalizzabili dall'utente
 * (nome servizio/lavoro/studi) che finiscono dentro dei template HTML: senza
 * questa funzione un nome tipo "<img onerror=...>" verrebbe eseguito.
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/** Data odierna "azzerata" al primo giorno del mese corrente (mezzanotte locale). */
export function firstDayOfCurrentMonth() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

/** true se la Date passata cade nel mese solare corrente (oggi). */
export function isCurrentCalendarMonth(d) {
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

/** Mostra una data in formato esteso italiano, es. "31 agosto 2026". */
export function formatDateLong(dateStr) {
  // Aggiungo un orario a mezzogiorno per evitare che il parsing interpreti
  // la data come UTC e la sposti di un giorno in alcuni fusi orari.
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

/** true se l'errore ricevuto sembra dovuto all'assenza di connessione, non a un errore applicativo. */
export function isNetworkError(err) {
  if (!navigator.onLine) return true;
  const msg = (err && err.message) ? String(err.message) : '';
  return /fetch|network|failed to fetch/i.test(msg);
}
