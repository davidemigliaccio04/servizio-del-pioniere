// ============================================================================
// constants.js
// Valori costanti condivisi da tutto il resto dell'app. Tenerli in un unico
// posto evita "numeri magici" sparsi nel codice e rende più facile capire
// il significato delle regole di business (es. la regola dell'abbuono).
// ============================================================================

/** Nomi dei mesi in italiano, indice 0 = Gennaio (come Date.getMonth()). */
export const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

/** Giorni della settimana per l'intestazione del calendario (Lunedì-Domenica). */
export const WEEKDAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

/**
 * Tetto della regola "abbuono lavoro": se il servizio del mese è sotto le 55h,
 * le ore di lavoro possono integrare il totale valido fino a questo tetto,
 * anche se l'obiettivo del mese impostato dall'utente è più alto.
 * 55 ore * 60 = 3300 minuti.
 */
export const WORK_ABBUONO_CAP_MINUTES = 3300;

/** Obiettivo mensile predefinito quando l'utente non ne imposta uno (55h). */
export const DEFAULT_MONTH_GOAL_MINUTES = 3300;

/** Durata massima ammessa per un singolo inserimento: 24 ore (vincolo anche a DB). */
export const MAX_ENTRY_MINUTES = 1440;

/** Chiave usata per salvare lo stato nel localStorage del browser. */
export const LOCAL_STORAGE_KEY = 'servizio_app_state';

/** Impostazioni predefinite di un profilo nuovo. */
export const DEFAULT_SETTINGS = {
  annualGoalMinutes: 36000, // 600 ore
  serviceName: 'Servizio di predicazione',
  workName: 'Lavori di manutenzione',
  studyName: 'Studi biblici',
  theme: 'light', // "Tema chiaro come impostazione predefinita" (spec punto 17)
  serviceColor: '#2563eb',  // blu principale dell'app (spec punto 18)
  workColor: '#ff8a00',     // arancione acceso (spec punto 18)
  progressColor: '#2563eb',
  buttonColor: '#2563eb',
  // NOVITA' (spec punto 18 "Impostazioni avanzate"): oltre a barra/pulsanti/
  // servizio/lavoro, la specifica chiede di poter personalizzare anche il
  // colore delle icone, dei testi e dello sfondo.
  iconColor: '#2563eb',
  textColor: '#15243b',
  bgColor: '#f7f9fc',
  // Ricordiamo l'ultima durata inserita, cosi' il time-picker si apre
  // gia' sul valore piu' probabile invece che fisso a 1h30 ogni volta.
  lastDurationMinutes: 90
};

/** Durata predefinita (in minuti) proposta per una giornata standard di lavoro di manutenzione (spec punto 12). */
export const DEFAULT_WORK_DAY_MINUTES = 480; // 8 ore
