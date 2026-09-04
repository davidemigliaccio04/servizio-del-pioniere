// ============================================================================
// selectors.js
// Funzioni che leggono lo "state" e calcolano valori derivati: totali del
// mese, minuti validi con la regola dell'abbuono, l'anno di servizio, ecc.
// Non modificano mai lo stato, solo lo interrogano.
// ============================================================================

import { state } from './state.js';
import { keyFor } from './utils.js';
import { WORK_ABBUONO_CAP_MINUTES, DEFAULT_MONTH_GOAL_MINUTES } from './constants.js';

/**
 * L'anno di servizio (in stile congregazioni: va da settembre ad agosto)
 * a cui appartiene una data. Es. sia agosto 2026 che settembre 2026
 * appartengono ad anni di servizio diversi: agosto 2026 è nell'anno di
 * servizio 2025 (set 2025 - ago 2026), settembre 2026 apre l'anno 2026.
 */
export function serviceYearFor(d) {
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * BUG RISOLTO (il più importante di tutti): converte una chiave mese in
 * anno solare "YYYY-MM" nel corretto "anno di servizio" da salvare su
 * Supabase (colonna service_year di month_goals).
 *
 * Prima, in saveSettings(), il codice usava semplicemente l'anno solare
 * della chiave anche per i mesi gennaio-agosto, che però appartengono
 * all'anno di servizio PRECEDENTE. Risultato: dopo un salvataggio e un
 * ricaricamento, gli obiettivi di quei mesi venivano riletti come se
 * appartenessero all'anno di servizio successivo (uno "slittamento" di un
 * anno). Questa funzione centralizza la conversione corretta e viene usata
 * sia per il salvataggio sia, per simmetria, la si può verificare contro la
 * lettura in storage.js.
 */
export function serviceYearForKey(key) {
  const [year, month] = key.split('-').map(Number); // month: 1-12
  return month >= 9 ? year : year - 1;
}

/** I 12 mesi (anno solare + mese) che compongono un dato anno di servizio, in ordine set->ago. */
export function serviceYearMonths(year = serviceYearFor(state.current)) {
  return [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7].map((month, i) => ({
    year: i < 4 ? year : year + 1,
    month
  }));
}

/** Obiettivo (in minuti) impostato per il mese della data data, o il default. */
export function monthGoal(d) {
  return state.goals[keyFor(d)] ?? DEFAULT_MONTH_GOAL_MINUTES;
}

/** Tutti gli inserimenti che ricadono nel mese della data data. */
export function entriesForMonth(d) {
  const k = keyFor(d);
  return state.entries.filter((e) => String(e.entry_date).startsWith(k));
}

/** Tutti gli inserimenti di un giorno preciso ("YYYY-MM-DD"), in ordine di creazione. */
export function entriesForDate(date) {
  return state.entries
    .filter((e) => e.entry_date === date)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

/** Somma dei minuti di servizio e di lavoro nel mese della data data. */
export function totals(d) {
  const es = entriesForMonth(d);
  return {
    service: es.filter((e) => e.entry_type === 'service').reduce((a, e) => a + Number(e.minutes), 0),
    work: es.filter((e) => e.entry_type === 'work').reduce((a, e) => a + Number(e.minutes), 0)
  };
}

/**
 * Minuti "validi" del mese secondo la regola dell'abbuono:
 * - se il servizio da solo raggiunge/supera le 55h, contano tutte le ore di servizio;
 * - altrimenti il lavoro può integrare il totale fino al tetto di 55h (mai oltre),
 *   anche se l'obiettivo del mese impostato dall'utente è più alto di 55h.
 */
export function validMinutes(d) {
  const { service, work } = totals(d);
  return service >= WORK_ABBUONO_CAP_MINUTES
    ? service
    : Math.min(WORK_ABBUONO_CAP_MINUTES, service + work);
}

/** Totale minuti validi su tutto l'anno di servizio. */
export function annualValid(year = serviceYearFor(state.current)) {
  return serviceYearMonths(year).reduce(
    (total, x) => total + validMinutes(new Date(x.year, x.month, 1)),
    0
  );
}
