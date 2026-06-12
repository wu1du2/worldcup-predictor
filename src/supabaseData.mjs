import { createClient } from '@supabase/supabase-js';

import { toAppMatch } from './matchSchedule.mjs';

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

export function mergePlayers(dbPlayers) {
  return dbPlayers || [];
}

export function mapPredictionsByPlayer(rows) {
  const predictions = {};

  for (const row of rows) {
    predictions[row.player_id] ||= {};
    predictions[row.player_id][row.match_id] = row.scores || [];
  }

  return predictions;
}

export async function loadMatches({ client }) {
  const { data, error } = await client
    .from('matches')
    .select('id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn)')
    .eq('active', true)
    .order('kickoff_at_utc', { ascending: true });

  if (error) throw error;
  return (data || []).filter(isCompleteMatchRow).map(toAppMatch);
}

export async function loadScoreOdds({ client, matches }) {
  const { data, error } = await client
    .from('score_odds')
    .select('home,away,kickoff_label,score,odds')
    .order('source_match_key', { ascending: true });

  if (error) throw error;
  return mapScoreOddsByMatch(matches, data || []);
}

export function mapScoreOddsByMatch(matches, oddsRows) {
  const rowsByMatchKey = new Map();

  for (const row of oddsRows || []) {
    const key = buildOddsMatchKey(row.home, row.away, row.kickoff_label);
    rowsByMatchKey.set(key, [...(rowsByMatchKey.get(key) || []), row]);
  }

  const oddsByMatchId = {};

  for (const match of matches || []) {
    const kickoffLabel = `${match.date.slice(5)} ${match.time}`;
    const key = buildOddsMatchKey(match.home, match.away, kickoffLabel);
    const rows = rowsByMatchKey.get(key) || [];
    if (!rows.length) continue;

    oddsByMatchId[match.id] = [
      ...rows
        .map((row) => ({ score: row.score, odds: Number(row.odds) }))
        .sort(compareScoreOptions),
      { score: '其他' },
    ];
  }

  return oddsByMatchId;
}

function isCompleteMatchRow(row) {
  return Boolean(row.match_code && row.match_date_cn && row.time_cn && row.home && row.away);
}

export async function loadGroupState({ client, groupCode }) {
  const group = await findOrCreateGroup(client, groupCode);

  const [{ data: players, error: playersError }, { data: predictions, error: predictionsError }] = await Promise.all([
    client.from('players').select('id,name').eq('group_id', group.id).order('created_at', { ascending: true }),
    client.from('predictions').select('player_id,match_id,scores').eq('group_id', group.id),
  ]);

  if (playersError) throw playersError;
  if (predictionsError) throw predictionsError;

  return {
    group,
    players: mergePlayers(players || []),
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

function buildOddsMatchKey(home, away, kickoffLabel) {
  return `${home}|${away}|${kickoffLabel}`;
}

function compareScoreOptions(a, b) {
  return getScoreOrder(a.score) - getScoreOrder(b.score) || a.score.localeCompare(b.score);
}

function getScoreOrder(score) {
  const preferred = [
    '1-0', '2-0', '2-1', '3-0', '3-1', '3-2',
    '4-0', '4-1', '4-2', '5-0', '5-1', '5-2',
    '0-0', '1-1', '2-2', '3-3',
    '0-1', '0-2', '1-2', '0-3', '1-3', '2-3',
    '0-4', '1-4', '2-4', '0-5', '1-5', '2-5',
  ];
  const index = preferred.indexOf(score);
  return index === -1 ? preferred.length : index;
}
