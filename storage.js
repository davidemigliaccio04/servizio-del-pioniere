// ============================================================================
// storage.js
// Tutta la persistenza dei dati: salvataggio/lettura locale (localStorage,
// usato come "fallback" quando Supabase non e' configurato o l'utente non ha
// fatto login) e sincronizzazione con Supabase (autenticazione, lettura e
// scrittura delle tabelle, realtime, migrazione dei dati locali al login).
// ============================================================================

import { state, resetUserState } from './state.js';
import { LOCAL_STORAGE_KEY, DEFAULT_SETTINGS } from './constants.js';
import { pad, isNetworkError } from './utils.js';
import { serviceYearForKey } from './selectors.js';

// --- Inizializzazione del client Supabase -----------------------------------
// window.supabase e' l'SDK caricato da CDN (script normale, non modulo);
// lo rinominiamo "sdk" per non confonderlo con il client che creiamo noi.
const sdk = window.supabase || {};
const cfg = window.SUPABASE_CONFIG || {};
const isSupabaseConfigured =
  Boolean(sdk.createClient) &&
  Boolean(cfg.url) && !cfg.url.includes('INSERISCI') &&
  Boolean(cfg.anonKey) && !cfg.anonKey.includes('INSERISCI');

/** Client Supabase pronto all'uso, oppure null se config.js non e' stato compilato. */
export const supabaseClient = isSupabaseConfigured ? sdk.createClient(cfg.url, cfg.anonKey) : null;

// -----------------------------------------------------------------------------
// Persistenza locale (localStorage)
// -----------------------------------------------------------------------------

/** Salva l'intero stato "dati utente" nel localStorage del browser. */
export function persistLocal() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    entries: state.entries,
    goals: state.goals,
    studies: state.studies,
    settings: state.settings
  }));
}

/** Ricarica lo stato salvato in precedenza nel localStorage, se presente. */
export function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    if (Array.isArray(saved.entries)) state.entries = saved.entries;
    if (saved.goals) state.goals = saved.goals;
    if (saved.studies) state.studies = saved.studies;
    if (saved.settings) state.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  } catch (err) {
    // Dati corrotti o assenti: si parte semplicemente da uno stato vuoto.
    console.error('Impossibile leggere i dati locali salvati:', err);
  }
}

function hasLocalData() {
  return state.entries.length > 0 || Object.keys(state.goals).length > 0;
}

// -----------------------------------------------------------------------------
// Lettura da Supabase (login e caricamento dati remoti)
// -----------------------------------------------------------------------------

let realtimeChannel = null;

/**
 * Carica lo stato dell'utente attualmente loggato da Supabase.
 * BUG RISOLTO: se sul dispositivo c'erano gia' dati inseriti in locale
 * (prima di configurare Supabase o di fare login) e l'account cloud e'
 * ancora vuoto, questi dati venivano prima sovrascritti e persi in
 * silenzio. Ora, in quel caso specifico, li carichiamo automaticamente
 * sul cloud invece di scartarli.
 */
export async function loadRemote() {
  if (!supabaseClient) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  state.user = session?.user || null;
  if (!state.user) return;

  // Istantanea dei dati locali PRIMA di sovrascriverli con quelli remoti,
  // da usare solo per l'eventuale migrazione automatica qui sotto.
  const localSnapshot = hasLocalData()
    ? { entries: [...state.entries], goals: { ...state.goals }, studies: { ...state.studies } }
    : null;

  const [profileRes, goalsRes, entriesRes, statsRes] = await Promise.all([
    supabaseClient.from('profiles').select('*').eq('id', state.user.id).maybeSingle(),
    supabaseClient.from('month_goals').select('*').eq('user_id', state.user.id),
    supabaseClient.from('time_entries').select('*').eq('user_id', state.user.id),
    supabaseClient.from('month_stats').select('*').eq('user_id', state.user.id)
  ]);

  if (profileRes.data) {
    const p = profileRes.data;
    state.settings = {
      ...state.settings,
      annualGoalMinutes: p.annual_goal_minutes,
      serviceName: p.service_name,
      workName: p.work_name,
      studyName: p.study_name,
      theme: p.theme,
      serviceColor: p.service_color,
      workColor: p.work_color,
      progressColor: p.progress_color,
      buttonColor: p.button_color,
      iconColor: p.icon_color ?? state.settings.iconColor,
      textColor: p.text_color ?? state.settings.textColor,
      bgColor: p.bg_color ?? state.settings.bgColor
    };
  }

  state.goals = {};
  (goalsRes.data || []).forEach((x) => {
    // Da (service_year, month 1-12) all'anno solare: l'inverso di serviceYearForKey.
    const calendarYear = x.month >= 9 ? x.service_year : x.service_year + 1;
    state.goals[`${calendarYear}-${pad(x.month)}`] = x.goal_minutes;
  });

  state.entries = entriesRes.data || [];

  state.studies = {};
  (statsRes.data || []).forEach((x) => {
    const calendarYear = x.month >= 9 ? x.service_year : x.service_year + 1;
    state.studies[`${calendarYear}-${pad(x.month)}`] = x.studies;
  });

  const cloudWasEmpty = state.entries.length === 0 && Object.keys(state.goals).length === 0;
  if (cloudWasEmpty && localSnapshot) {
    await migrateLocalDataToCloud(localSnapshot);
  }

  setupRealtime();
}

/** Carica su Supabase i dati che erano stati salvati solo in locale, una tantum dopo il primo login. */
async function migrateLocalDataToCloud(localSnapshot) {
  if (localSnapshot.entries.length) {
    const rows = localSnapshot.entries.map((e) => ({
      user_id: state.user.id,
      entry_date: e.entry_date,
      entry_type: e.entry_type,
      minutes: e.minutes
    }));
    const { data, error } = await supabaseClient.from('time_entries').insert(rows).select();
    if (!error && data) state.entries = data;
  }
  if (Object.keys(localSnapshot.goals).length) {
    const { error } = await saveMonthGoalsToCloud(localSnapshot.goals);
    if (!error) state.goals = localSnapshot.goals;
  }
  const studyRows = Object.entries(localSnapshot.studies || {});
  for (const [key, count] of studyRows) {
    const [year, month] = key.split('-').map(Number);
    await supabaseClient.from('month_stats').upsert({
      user_id: state.user.id,
      service_year: serviceYearForKey(key),
      month,
      studies: count
    }, { onConflict: 'user_id,service_year,month' });
  }
  if (studyRows.length) state.studies = localSnapshot.studies;
  // I dati sono ora sul cloud: puliamo la copia locale per evitare di
  // riproporla a un'altra migrazione in futuro.
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

/** Ascolta le modifiche remote (da altri dispositivi) e ricarica i dati quando cambiano. */
function setupRealtime(onChange) {
  if (!supabaseClient || !state.user) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient
    .channel('service-data-' + state.user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `user_id=eq.${state.user.id}` }, () => loadRemote().then(onChange))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'month_goals', filter: `user_id=eq.${state.user.id}` }, () => loadRemote().then(onChange))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'month_stats', filter: `user_id=eq.${state.user.id}` }, () => loadRemote().then(onChange))
    .subscribe();
}

/** Permette a main.js di passare la callback di re-render da usare nel realtime. */
export function setRealtimeChangeHandler(handler) {
  if (state.user) setupRealtime(handler);
}

// -----------------------------------------------------------------------------
// Scrittura su Supabase (o fallback locale)
// -----------------------------------------------------------------------------

/**
 * Salva un obiettivo mensile per ogni mese passato in `goalsMap`
 * (chiave "YYYY-MM" anno solare -> minuti). Usa un'unica upsert "in batch"
 * invece di un giro di await in sequenza: piu' veloce e, se qualcosa va
 * storto, non lascia lo stato a meta' salvato.
 * BUG RISOLTO: qui e' dove prima veniva salvato l'anno solare al posto
 * dell'anno di servizio per i mesi gennaio-agosto (vedi serviceYearForKey).
 */
export async function saveMonthGoalsToCloud(goalsMap) {
  if (!supabaseClient || !state.user) return { error: null };
  const rows = Object.entries(goalsMap).map(([key, minutes]) => {
    const [, month] = key.split('-').map(Number);
    return {
      user_id: state.user.id,
      service_year: serviceYearForKey(key),
      month,
      goal_minutes: minutes
    };
  });
  if (!rows.length) return { error: null };
  return supabaseClient.from('month_goals').upsert(rows, { onConflict: 'user_id,service_year,month' });
}

/** Salva il profilo (impostazioni generali) su Supabase. */
export async function saveProfileToCloud() {
  if (!supabaseClient || !state.user) return { error: null };
  const p = {
    id: state.user.id,
    annual_goal_minutes: state.settings.annualGoalMinutes,
    service_name: state.settings.serviceName,
    work_name: state.settings.workName,
    study_name: state.settings.studyName,
    theme: state.settings.theme,
    service_color: state.settings.serviceColor,
    work_color: state.settings.workColor,
    progress_color: state.settings.progressColor,
    button_color: state.settings.buttonColor,
    icon_color: state.settings.iconColor,
    text_color: state.settings.textColor,
    bg_color: state.settings.bgColor,
    updated_at: new Date().toISOString()
  };
  return supabaseClient.from('profiles').upsert(p);
}

/**
 * Crea o aggiorna un inserimento di ore. Gestisce tre casi: account con
 * connessione (Supabase), account ma offline (salva comunque in locale e la
 * segna come "da sincronizzare"), nessun account (solo locale).
 */
export async function saveTimeEntry({ id, entry_date, entry_type, minutes }) {
  if (supabaseClient && state.user) {
    try {
      if (id) {
        const { data, error } = await supabaseClient
          .from('time_entries')
          .update({ entry_date, entry_type, minutes, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', state.user.id)
          .select().single();
        if (error) throw error;
        return { ok: true, data };
      }
      const { data, error } = await supabaseClient
        .from('time_entries')
        .insert({ entry_date, entry_type, minutes, user_id: state.user.id })
        .select().single();
      if (error) throw error;
      return { ok: true, data };
    } catch (err) {
      if (isNetworkError(err)) {
        // NOVITA': nessuna connessione ma utente autenticato. Prima l'app si
        // limitava a mostrare un errore e perdeva l'inserimento; ora lo
        // teniamo in locale con un flag "_pendingSync" e lo sincronizziamo
        // automaticamente al ritorno della connessione (vedi flushPendingSync).
        const localEntry = {
          id: id || `local-${crypto.randomUUID()}`,
          entry_date, entry_type, minutes,
          created_at: new Date().toISOString(),
          _pendingSync: true
        };
        return { ok: true, offline: true, data: localEntry };
      }
      return { ok: false, error: err.message || 'Errore di salvataggio' };
    }
  }
  // Modalita' locale (nessun account collegato).
  return {
    ok: true,
    data: { id: id || crypto.randomUUID(), entry_date, entry_type, minutes, created_at: new Date().toISOString() }
  };
}

/** Elimina un inserimento, dal cloud o dallo stato locale. */
export async function deleteTimeEntry(id) {
  if (supabaseClient && state.user && !String(id).startsWith('local-')) {
    const { error } = await supabaseClient.from('time_entries').delete().eq('id', id).eq('user_id', state.user.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Salva il conteggio studi biblici di un mese. */
export async function saveMonthStudies(key, value) {
  if (supabaseClient && state.user) {
    const [, month] = key.split('-').map(Number);
    const { error } = await supabaseClient.from('month_stats').upsert({
      user_id: state.user.id,
      service_year: serviceYearForKey(key),
      month,
      studies: value
    }, { onConflict: 'user_id,service_year,month' });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Ritenta l'invio al cloud degli inserimenti creati mentre si era offline.
 * Va richiamata quando il browser segnala che la connessione e' tornata.
 */
export async function flushPendingSync() {
  if (!supabaseClient || !state.user) return false;
  const pending = state.entries.filter((e) => e._pendingSync);
  let anySynced = false;
  for (const e of pending) {
    const { data, error } = await supabaseClient
      .from('time_entries')
      .insert({ entry_date: e.entry_date, entry_type: e.entry_type, minutes: e.minutes, user_id: state.user.id })
      .select().single();
    if (!error && data) {
      state.entries = state.entries.map((x) => (x.id === e.id ? data : x));
      anySynced = true;
    }
  }
  return anySynced;
}

// -----------------------------------------------------------------------------
// Autenticazione
// -----------------------------------------------------------------------------

export async function signUp(email, password) {
  if (!supabaseClient) return { ok: false, message: 'Configura prima Supabase in config.js' };
  const { error } = await supabaseClient.auth.signUp({ email, password });
  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: 'Registrazione inviata. Controlla la tua email se e\' richiesta la conferma.' };
}

export async function signIn(email, password) {
  if (!supabaseClient) return { ok: false, message: 'Configura prima Supabase in config.js' };
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  state.user = data.user;
  await loadRemote();
  return { ok: true, message: 'Accesso effettuato' };
}

/** Invia l'email per reimpostare la password (NOVITA' rispetto alla versione precedente). */
export async function requestPasswordReset(email) {
  if (!supabaseClient) return { ok: false, message: 'Configura prima Supabase in config.js' };
  if (!email) return { ok: false, message: 'Inserisci la tua email prima di richiedere il reset' };
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Email di reset inviata, controlla la posta.' };
}

/**
 * BUG RISOLTO: prima il logout azzerava solo `state.user` senza svuotare i
 * dati gia' caricati in memoria (ore, obiettivi, studi), che restavano
 * visibili a schermo finche' non si ricaricava la pagina: un problema di
 * privacy su dispositivi condivisi. Ora resettiamo tutto lo stato utente e,
 * se esistono dati locali di fallback, li ricarichiamo al posto di quelli
 * dell'account appena disconnesso.
 */
export async function signOut() {
  if (realtimeChannel) {
    await supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  await supabaseClient?.auth.signOut();
  resetUserState();
  loadLocal();
}
