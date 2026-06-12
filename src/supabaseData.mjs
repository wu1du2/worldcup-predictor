import { createClient } from '@supabase/supabase-js';

export function createSupabaseBrowserClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey);
}

export function getGroupCodeFromSearch(search) {
  const params = new URLSearchParams(search);
  const code = params.get('group')?.trim();
  return code || 'default';
}

export function mergePlayers(defaultPlayers, dbPlayers) {
  const playersByName = new Map(dbPlayers.map((player) => [player.name, player]));
  const merged = defaultPlayers.map((player) => playersByName.get(player.name) || player);
  const defaultNames = new Set(defaultPlayers.map((player) => player.name));
  const customPlayers = dbPlayers.filter((player) => !defaultNames.has(player.name));

  return [...merged, ...customPlayers];
}

export function mapPredictionsByPlayer(rows) {
  const predictions = {};

  for (const row of rows) {
    predictions[row.player_id] ||= {};
    predictions[row.player_id][row.match_id] = row.scores || [];
  }

  return predictions;
}

export async function loadGroupState({ client, groupCode, defaultPlayers }) {
  const group = await findOrCreateGroup(client, groupCode);
  await ensureDefaultPlayers(client, group.id, defaultPlayers);

  const [{ data: players, error: playersError }, { data: predictions, error: predictionsError }] = await Promise.all([
    client.from('players').select('id,name').eq('group_id', group.id).order('created_at', { ascending: true }),
    client.from('predictions').select('player_id,match_id,scores').eq('group_id', group.id),
  ]);

  if (playersError) throw playersError;
  if (predictionsError) throw predictionsError;

  return {
    group,
    players: mergePlayers(defaultPlayers, players || []),
    predictions: mapPredictionsByPlayer(predictions || []),
  };
}

export async function createGroupPlayer({ client, groupId, name }) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  const { data: existing, error: existingError } = await client
    .from('players')
    .select('id,name')
    .eq('group_id', groupId)
    .eq('name', trimmedName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await client
    .from('players')
    .insert({ group_id: groupId, name: trimmedName })
    .select('id,name')
    .single();

  if (error) throw error;
  return data;
}

export async function saveGroupPredictions({ client, groupId, playerId, entries }) {
  if (!entries.length) return;

  const rows = entries.map((entry) => ({
    group_id: groupId,
    player_id: playerId,
    match_id: entry.matchId,
    scores: entry.scores,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await client
    .from('predictions')
    .upsert(rows, { onConflict: 'group_id,player_id,match_id' });

  if (error) throw error;
}

async function findOrCreateGroup(client, groupCode) {
  const { data: existing, error: existingError } = await client
    .from('groups')
    .select('id,code,name')
    .eq('code', groupCode)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await client
    .from('groups')
    .insert({ code: groupCode, name: groupCode })
    .select('id,code,name')
    .single();

  if (error) throw error;
  return data;
}

async function ensureDefaultPlayers(client, groupId, defaultPlayers) {
  for (const player of defaultPlayers) {
    await createGroupPlayer({ client, groupId, name: player.name });
  }
}
