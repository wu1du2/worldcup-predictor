import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  buildScoreOptionsForMatch,
  createInitialState,
  exportAllTimeStatsText,
  exportPredictionsText,
  formatScoreOptionLabel,
  formatScoreTrendLabel,
  getCopyStatusText,
  getScoreTrendDirection,
  isCorrectScoreOption,
  normalizePredictionState,
  toggleScorePick,
} from './predictionStore.mjs';
import {
  createGroupPlayer,
  createSupabaseBrowserClient,
  buildFutureScoreOddsWindow,
  generateGroupCode,
  getGroupCodeFromSearch,
  loadAiRecommendations,
  loadAiStrategyStats,
  loadImportReports,
  loadGroupState,
  loadMatches,
  loadScoreOdds,
  saveGroupPredictions,
  submitAiUserStrategy,
} from './supabaseData.mjs';
import {
  createD1BrowserClient,
  createD1GroupPlayer,
  loadD1AdvancementPredictions,
  loadD1ChampionRoad,
  loadD1HandicapChallenge,
  loadD1LiveBoard,
  loadD1GroupState,
  saveD1AdvancementPredictions,
  saveD1ChampionRoadPrediction,
  saveD1GroupPredictions,
  saveD1HandicapChallengePredictions,
} from './d1Data.mjs';
import { formatReportJobTitle, formatReportStatusText } from './importReports.mjs';
import { buildRecentLiveDateWindow } from './liveWindow.mjs';
import {
  getAiReasonPreview,
  getAiRecommendationForMatch,
  isAiPlayer,
} from './aiRecommendation.mjs';
import {
  buildDateTabs,
  formatChinaDateLabel,
  getDefaultMatchDateCn,
  getMatchScoreText,
  getNextMatchDateCn,
} from './matchSchedule.mjs';
import {
  getKnockoutMetricLabels,
  getKnockoutStrategyFamilies,
  getKnockoutVersionPoints,
} from './knockoutStrategyEvolution.mjs';
import {
  buildAiStrategyTabsForMatch,
  getDefaultAiStrategyTabId,
} from './aiStrategyTabs.mjs';
import {
  buildAiStrategyHitDetailsIndex,
  formatHitDetailRoi,
  getAiStrategyHitDetail,
} from './aiStrategyHitDetails.mjs';
import { getStaticAiStrategyStatsPage, loadStaticGroupSnapshot, loadStaticSnapshot } from './staticSnapshot.mjs';
import { mergeLiveBoardSnapshot } from './liveBoard.mjs';
import {
  buildAdvancementEntries,
  countAdvancementSelections,
  exportAdvancementPredictionsText,
  getAdvancementLockText,
  isAdvancementTieLocked,
  mergeAdvancementTiesWithMatches,
} from './advancementPrediction.mjs';
import {
  buildHandicapChallengeEntries,
  calculateHandicapChallengePayout,
  exportHandicapChallengeText,
  formatHandicapChoiceLabel,
  formatHandicapMatchLabel,
  formatMaxPayoutOdds,
  formatProbability,
  getHandicapResultChoice,
  handicapChoiceKeys,
} from './handicapChallenge.mjs';
import {
  buildDefaultChampionRanking,
  exportChampionRoadText,
  getChampionRankingSummary,
  isCompleteChampionRanking,
  moveChampionRankingItem,
} from './championRoad.mjs';
import './styles.css';

const storageKey = 'worldcup-prediction-stage2';

let aiStrategyHitDetailsIndexCache = null;

function loadState() {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return createInitialState();

  try {
    return normalizePredictionState(JSON.parse(saved));
  } catch {
    return createInitialState();
  }
}

function App() {
  const [state, setState] = useState(loadState);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scoreOddsByMatch, setScoreOddsByMatch] = useState({});
  const [group, setGroup] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reportDialog, setReportDialog] = useState({ open: false, status: 'idle', reports: [], error: '' });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [createdHintOpen, setCreatedHintOpen] = useState(false);
  const [aiRecommendationDialog, setAiRecommendationDialog] = useState(null);
  const [aiRecommendationsByMatch, setAiRecommendationsByMatch] = useState({});
  const [aiStrategyStats, setAiStrategyStats] = useState([]);
  const [staticSnapshot, setStaticSnapshot] = useState(null);
  const [aiStrategyOpen, setAiStrategyOpen] = useState(false);
  const [aiStrategyForm, setAiStrategyForm] = useState({ authorName: '', strategyName: '', strategyPrompt: '', status: 'idle', error: '' });
  const [strategyRankDialog, setStrategyRankDialog] = useState({ open: false, status: 'idle', rows: [], page: 0, hasNext: false, error: '' });
  const [strategyHitDetail, setStrategyHitDetail] = useState(null);
  const [knockoutStrategyOpen, setKnockoutStrategyOpen] = useState(false);
  const [advancementDialog, setAdvancementDialog] = useState({
    open: false,
    status: 'idle',
    ties: [],
    predictionsByPlayer: {},
    draft: {},
    error: '',
  });
  const [handicapDialog, setHandicapDialog] = useState({
    open: false,
    status: 'idle',
    matches: [],
    predictionsByPlayer: {},
    draft: {},
    error: '',
  });
  const [championDialog, setChampionDialog] = useState({
    open: false,
    status: 'idle',
    teams: [],
    predictionsByPlayer: {},
    draft: [],
    locked: false,
    error: '',
  });
  const selectedDateButtonRef = useRef(null);
  const hydratedD1WindowsRef = useRef(new Set());
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const d1Client = useMemo(() => createD1BrowserClient(), []);
  const groupCode = getGroupCodeFromSearch(window.location.search);

  async function refreshGroupState() {
    setLoadStatus('loading');
    setErrorMessage('');

    try {
      const snapshot = await loadStaticSnapshot();
      if (snapshot?.matches.length) {
        setStaticSnapshot(snapshot);
        setMatches(snapshot.matches);
        setScoreOddsByMatch(snapshot.scoreOddsByMatch);
        setAiRecommendationsByMatch(snapshot.aiRecommendationsByMatch);
        setAiStrategyStats(snapshot.aiStrategyStats || []);
        setLoadStatus('ready');
        updateState((current) => ({
          ...current,
          groupCode,
          selectedDate: new Set(snapshot.matches.map((match) => match.date)).has(current.selectedDate)
            ? current.selectedDate
            : getDefaultMatchDateCn(snapshot.matches),
        }));
        hydrateLiveBoardFromD1();
      }

      const staticGroupSnapshot = await loadStaticGroupSnapshot(groupCode);
      if (staticGroupSnapshot) {
        setGroup(staticGroupSnapshot.group);
        setPlayers(staticGroupSnapshot.players);
        updateState((current) => ({
          ...current,
          selectedPlayerId: current.groupCode === groupCode ? current.selectedPlayerId : '',
          draftPicks: current.groupCode === groupCode ? current.draftPicks : {},
          predictions: staticGroupSnapshot.predictions,
          groupCode,
        }));
      }

      let loaded;
      try {
        if (d1Client) loaded = await loadD1GroupState({ client: d1Client, groupCode });
      } catch (error) {
        console.warn('Failed to load D1 group state', error);
      }

      try {
        if (!loaded && client) loaded = await loadGroupState({ client, groupCode });
      } catch (error) {
        if (staticGroupSnapshot || snapshot?.matches.length) {
          console.warn('Failed to load group state; using static cache only', error);
          return;
        }
        throw error;
      }

      if (!loaded) {
        if (staticGroupSnapshot || snapshot?.matches.length) return;
        throw new Error('D1 和 Supabase 配置缺失');
      }

      const loadedMatches = snapshot?.matches.length ? snapshot.matches : (client ? await loadMatches({ client }) : []);
      if (!loadedMatches.length) throw new Error('赛程快照缺失');
      const availableDates = new Set(loadedMatches.map((match) => match.date));
      setGroup(loaded.group);
      setPlayers(loaded.players);
      if (!snapshot?.matches.length) {
        setMatches(loadedMatches);
        setScoreOddsByMatch({});
        setAiRecommendationsByMatch({});
      }
      updateState((current) => ({
        ...current,
        selectedPlayerId: current.groupCode === groupCode ? current.selectedPlayerId : '',
        draftPicks: current.groupCode === groupCode ? current.draftPicks : {},
        predictions: loaded.predictions,
        groupCode,
        selectedDate: availableDates.has(current.selectedDate) ? current.selectedDate : getDefaultMatchDateCn(loadedMatches),
      }));
      setLoadStatus('ready');
      if (!snapshot?.matches.length) hydrateLiveBoardFromD1();
      if (!snapshot?.matches.length) {
        void loadScoreOdds({ client, matches: loadedMatches, oddsWindow: buildFutureScoreOddsWindow() })
          .then(setScoreOddsByMatch)
          .catch((error) => console.warn('Failed to load score odds', error));
        void loadAiRecommendations({ client })
          .then(setAiRecommendationsByMatch)
          .catch((error) => console.warn('Failed to load AI recommendations', error));
      }
    } catch (error) {
      setLoadStatus('error');
      setErrorMessage(error.message || '加载失败');
    }
  }

  function hydrateLiveBoardFromD1(windowOverride = null) {
    if (!d1Client) return;
    const liveWindow = windowOverride || buildRecentLiveDateWindow(new Date(), { pastDays: 7, futureDays: 2 });
    const windowKey = `${liveWindow.from}:${liveWindow.to}`;
    if (hydratedD1WindowsRef.current.has(windowKey)) return;
    hydratedD1WindowsRef.current.add(windowKey);
    void loadD1LiveBoard({ client: d1Client, from: liveWindow.from, to: liveWindow.to })
      .then((liveBoard) => {
        setMatches((currentMatches) => mergeLiveBoardSnapshot({ matches: currentMatches }, liveBoard).matches);
        setScoreOddsByMatch((currentOdds) => mergeLiveBoardSnapshot({ scoreOddsByMatch: currentOdds }, liveBoard).scoreOddsByMatch);
        setAiRecommendationsByMatch((currentRecommendations) => ({
          ...currentRecommendations,
          ...(liveBoard.aiRecommendationsByMatch || {}),
        }));
        if (liveBoard.aiStrategyStats?.length) {
          setAiStrategyStats(liveBoard.aiStrategyStats);
        }
        if (liveBoard.importReports?.length) {
          setStaticSnapshot((current) => current ? {
            ...current,
            importReports: liveBoard.importReports,
            aiStrategyStats: liveBoard.aiStrategyStats?.length ? liveBoard.aiStrategyStats : current.aiStrategyStats,
          } : current);
        }
      })
      .catch((error) => console.warn('Failed to hydrate D1 live board', error));
  }

  useEffect(() => {
    if (!groupCode) return;
    refreshGroupState();
  }, [client, groupCode]);

  useEffect(() => {
    if (!groupCode) return;
    const hintGroup = window.sessionStorage.getItem('created-group-hint');
    if (hintGroup !== groupCode) return;
    window.sessionStorage.removeItem('created-group-hint');
    setCreatedHintOpen(true);
  }, [groupCode]);

  function updateState(updater) {
    setState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  const selectablePlayers = players.filter((player) => !isAiPlayer(player));
  const aiPlayer = players.find((player) => isAiPlayer(player));
  const aiPredictions = aiPlayer ? state.predictions?.[aiPlayer.id] || {} : {};
  const selectedPlayer = selectablePlayers.find((player) => player.id === state.selectedPlayerId);
  const dateTabs = buildDateTabs(matches);
  const selectedDate = state.selectedDate || getDefaultMatchDateCn(matches);
  const visibleMatches = matches.filter((match) => match.date === selectedDate);
  const dateLabel = selectedDate ? formatChinaDateLabel(selectedDate) : '暂无赛程';
  const inviteDate = selectedDate ? getNextMatchDateCn(matches, selectedDate) : '';
  const inviteMatches = inviteDate ? matches.filter((match) => match.date === inviteDate) : [];
  const inviteDateLabel = inviteDate ? formatChinaDateLabel(inviteDate) : '';
  const selectedAdvancementDraft = advancementDialog.open
    ? advancementDialog.draft
    : buildAdvancementDraftFromPredictions(advancementDialog.predictionsByPlayer, state.selectedPlayerId);
  const advancementSelectedCount = countAdvancementSelections(selectedAdvancementDraft, advancementDialog.ties);
  const advancementTotalCount = advancementDialog.ties.length || 8;
  const selectedHandicapDraft = handicapDialog.open
    ? handicapDialog.draft
    : buildHandicapDraftFromPredictions(handicapDialog.predictionsByPlayer, state.selectedPlayerId);
  const handicapSelectedCount = countHandicapSelections(selectedHandicapDraft, handicapDialog.matches);
  const handicapTotalCount = handicapDialog.matches.length || 4;
  const handicapPayout = calculateHandicapChallengePayout(selectedHandicapDraft, handicapDialog.matches);
  const selectedChampionDraft = championDialog.open
    ? championDialog.draft
    : buildChampionDraftFromPredictions(championDialog.predictionsByPlayer, state.selectedPlayerId, championDialog.teams);
  const hasSavedChampionRanking = isCompleteChampionRanking(
    championDialog.predictionsByPlayer?.[state.selectedPlayerId]?.ranking || [],
    championDialog.teams,
  );
  const championRankedCount = hasSavedChampionRanking
    ? countChampionRankingSelections(selectedChampionDraft, championDialog.teams)
    : 0;

  useEffect(() => {
    if (!groupCode) return;
    selectedDateButtonRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }, [groupCode, selectedDate, dateTabs.length]);

  if (!groupCode) {
    return <HomePage />;
  }

  function selectedScores(matchId, currentState = state) {
    const playerId = currentState.selectedPlayerId;
    const draftScores = currentState.draftPicks?.[matchId];
    if (!playerId) return Array.isArray(draftScores) ? draftScores : [];
    const savedScores = currentState.predictions?.[playerId]?.[matchId];
    if (Array.isArray(draftScores)) return draftScores;
    return Array.isArray(savedScores) ? savedScores : [];
  }

  function selectPlayer(playerId) {
    updateState((current) => ({
      ...current,
      selectedPlayerId: playerId,
      draftPicks: {},
    }));
  }

  function selectDate(selectedDate) {
    hydrateLiveBoardFromD1({ from: selectedDate, to: selectedDate });
    updateState((current) => ({
      ...current,
      selectedDate,
      draftPicks: {},
      exportText: '',
    }));
  }

  function toggleMatchScore(matchId, score) {
    if (!state.selectedPlayerId) return;

    updateState((current) => ({
      ...current,
      draftPicks: {
        ...current.draftPicks,
        [matchId]: toggleScorePick(selectedScores(matchId, current), score),
      },
    }));
  }

  async function submitAll() {
    if (!state.selectedPlayerId || (!d1Client && (!group || !client))) return;

    const entries = visibleMatches
      .map((match) => ({ matchId: match.id, scores: selectedScores(match.id) }))
      .filter((entry) => entry.scores.length > 0);

    updateState((current) => ({ ...current, flash: '保存中...' }));

    try {
      let loaded;
      if (d1Client) {
        await saveD1GroupPredictions({
          client: d1Client,
          groupCode,
          playerId: state.selectedPlayerId,
          entries,
        });
        loaded = await loadD1GroupState({ client: d1Client, groupCode });
      } else {
        await saveGroupPredictions({
          client,
          groupId: group.id,
          playerId: state.selectedPlayerId,
          entries,
        });
        loaded = await loadGroupState({ client, groupCode });
      }
      setPlayers(loaded.players);
      updateState((current) => ({
        ...current,
        predictions: loaded.predictions,
        draftPicks: {},
        flash: '已保存，可以回群里继续催大家交卷。',
      }));
    } catch (error) {
      updateState((current) => ({
        ...current,
        flash: error.message || '保存失败',
      }));
    }
  }

  async function openAdvancementDialog() {
    if (!selectedPlayer) {
      updateState((current) => ({ ...current, flash: '先选择用户名，再填写晋级预测。' }));
      return;
    }
    if (!d1Client) {
      setAdvancementDialog({
        open: true,
        status: 'error',
        ties: [],
        predictionsByPlayer: {},
        draft: {},
        error: 'D1 API 配置缺失',
      });
      return;
    }

    setAdvancementDialog((current) => ({
      ...current,
      open: true,
      status: 'loading',
      error: '',
    }));

    try {
      const payload = await loadD1AdvancementPredictions({ client: d1Client, groupCode });
      setAdvancementDialog({
        open: true,
        status: 'ready',
        ties: payload.ties,
        predictionsByPlayer: payload.predictionsByPlayer,
        draft: buildAdvancementDraftFromPredictions(payload.predictionsByPlayer, selectedPlayer.id),
        error: '',
      });
    } catch (error) {
      setAdvancementDialog((current) => ({
        ...current,
        open: true,
        status: 'error',
        error: error.message || '晋级预测加载失败',
      }));
    }
  }

  function selectAdvancementWinner(matchId, winnerSide) {
    const tie = advancementDialog.ties.find((item) => item.matchId === matchId);
    if (!tie || tie.locked || isAdvancementTieLocked(tie)) return;
    setAdvancementDialog((current) => ({
      ...current,
      draft: {
        ...current.draft,
        [matchId]: current.draft?.[matchId] === winnerSide ? '' : winnerSide,
      },
      error: '',
    }));
  }

  async function submitAdvancementPredictions() {
    if (!selectedPlayer || !d1Client) return;
    const entries = buildAdvancementEntries(advancementDialog.draft);
    if (!entries.length) {
      setAdvancementDialog((current) => ({ ...current, error: '至少选择一场晋级结果' }));
      return;
    }

    setAdvancementDialog((current) => ({ ...current, status: 'saving', error: '' }));

    try {
      await saveD1AdvancementPredictions({
        client: d1Client,
        groupCode,
        playerId: selectedPlayer.id,
        entries,
      });
      const tiesById = new Map(advancementDialog.ties.map((tie) => [tie.matchId, tie]));
      const savedRows = Object.fromEntries(entries.map((entry) => {
        const tie = tiesById.get(entry.matchId);
        return [entry.matchId, {
          winnerSide: entry.winnerSide,
          winnerName: entry.winnerSide === 'home' ? tie?.home || '' : tie?.away || '',
        }];
      }));
      setAdvancementDialog((current) => ({
        ...current,
        status: 'ready',
        predictionsByPlayer: {
          ...current.predictionsByPlayer,
          [selectedPlayer.id]: {
            ...(current.predictionsByPlayer[selectedPlayer.id] || {}),
            ...savedRows,
          },
        },
        error: '',
      }));
      updateState((current) => ({ ...current, flash: '晋级预测已保存。' }));
    } catch (error) {
      setAdvancementDialog((current) => ({
        ...current,
        status: 'ready',
        error: error.message || '晋级预测保存失败',
      }));
    }
  }

  async function openHandicapChallengeDialog() {
    if (!selectedPlayer) {
      updateState((current) => ({ ...current, flash: '先选择用户名，再参加四强挑战。' }));
      return;
    }
    if (!d1Client) {
      setHandicapDialog({
        open: true,
        status: 'error',
        matches: [],
        predictionsByPlayer: {},
        draft: {},
        error: 'D1 API 配置缺失',
      });
      return;
    }

    setHandicapDialog((current) => ({
      ...current,
      open: true,
      status: 'loading',
      error: '',
    }));

    try {
      const payload = await loadD1HandicapChallenge({ client: d1Client, groupCode });
      setHandicapDialog({
        open: true,
        status: 'ready',
        matches: payload.matches,
        predictionsByPlayer: payload.predictionsByPlayer,
        draft: buildHandicapDraftFromPredictions(payload.predictionsByPlayer, selectedPlayer.id),
        error: '',
      });
    } catch (error) {
      setHandicapDialog((current) => ({
        ...current,
        open: true,
        status: 'error',
        error: error.message || '四强挑战加载失败',
      }));
    }
  }

  async function openChampionRoadDialog() {
    if (!selectedPlayer) {
      updateState((current) => ({ ...current, flash: '先选择用户名，再填写冠军之路。' }));
      return;
    }
    if (!d1Client) {
      setChampionDialog({
        open: true,
        status: 'error',
        teams: [],
        predictionsByPlayer: {},
        draft: [],
        locked: false,
        error: 'D1 API 配置缺失',
      });
      return;
    }

    setChampionDialog((current) => ({
      ...current,
      open: true,
      status: 'loading',
      error: '',
    }));

    try {
      const payload = await loadD1ChampionRoad({ client: d1Client, groupCode });
      setChampionDialog({
        open: true,
        status: 'ready',
        teams: payload.teams,
        predictionsByPlayer: payload.predictionsByPlayer,
        draft: buildChampionDraftFromPredictions(payload.predictionsByPlayer, selectedPlayer.id, payload.teams),
        locked: payload.locked,
        error: '',
      });
    } catch (error) {
      setChampionDialog((current) => ({
        ...current,
        open: true,
        status: 'error',
        error: error.message || '冠军之路加载失败',
      }));
    }
  }

  function moveChampionTeam(fromIndex, toIndex) {
    if (championDialog.locked) return;
    setChampionDialog((current) => ({
      ...current,
      draft: moveChampionRankingItem(current.draft, fromIndex, toIndex),
      error: '',
    }));
  }

  async function submitChampionRoadPrediction() {
    if (!selectedPlayer || !d1Client) return;
    if (!isCompleteChampionRanking(championDialog.draft, championDialog.teams)) {
      setChampionDialog((current) => ({ ...current, error: '请把四支球队完整排序' }));
      return;
    }

    setChampionDialog((current) => ({ ...current, status: 'saving', error: '' }));

    try {
      await saveD1ChampionRoadPrediction({
        client: d1Client,
        groupCode,
        playerId: selectedPlayer.id,
        ranking: championDialog.draft,
      });
      setChampionDialog((current) => ({
        ...current,
        status: 'ready',
        predictionsByPlayer: {
          ...current.predictionsByPlayer,
          [selectedPlayer.id]: {
            ranking: current.draft,
            teamNames: current.draft.map((teamKey) => current.teams.find((team) => team.teamKey === teamKey)?.name || teamKey),
          },
        },
        error: '',
      }));
      updateState((current) => ({ ...current, flash: '冠军之路已保存。' }));
    } catch (error) {
      setChampionDialog((current) => ({
        ...current,
        status: 'ready',
        error: error.message || '冠军之路保存失败',
      }));
    }
  }

  function selectHandicapChoice(matchId, choiceKey) {
    const match = handicapDialog.matches.find((item) => item.matchId === matchId);
    if (!match || match.locked || isAdvancementTieLocked(match)) return;
    setHandicapDialog((current) => ({
      ...current,
      draft: {
        ...current.draft,
        [matchId]: current.draft?.[matchId] === choiceKey ? '' : choiceKey,
      },
      error: '',
    }));
  }

  async function submitHandicapChallengePredictions() {
    if (!selectedPlayer || !d1Client) return;
    const entries = buildHandicapChallengeEntries(handicapDialog.draft);
    if (!entries.length) {
      setHandicapDialog((current) => ({ ...current, error: '至少选择一场结果' }));
      return;
    }

    setHandicapDialog((current) => ({ ...current, status: 'saving', error: '' }));

    try {
      await saveD1HandicapChallengePredictions({
        client: d1Client,
        groupCode,
        playerId: selectedPlayer.id,
        entries,
      });
      const savedRows = Object.fromEntries(entries.map((entry) => [
        entry.matchId,
        { choiceKey: entry.choiceKey },
      ]));
      setHandicapDialog((current) => ({
        ...current,
        status: 'ready',
        predictionsByPlayer: {
          ...current.predictionsByPlayer,
          [selectedPlayer.id]: {
            ...(current.predictionsByPlayer[selectedPlayer.id] || {}),
            ...savedRows,
          },
        },
        error: '',
      }));
      updateState((current) => ({ ...current, flash: '四强挑战已保存。' }));
    } catch (error) {
      setHandicapDialog((current) => ({
        ...current,
        status: 'ready',
        error: error.message || '四强挑战保存失败',
      }));
    }
  }

  function showExport() {
    const text = exportPredictionsText({
      dateLabel,
      matches: visibleMatches,
      players,
      state,
      scoreOddsByMatch,
      inviteDateLabel,
      inviteMatches,
      currentGroupUrl: window.location.href,
    });

    setState((current) => ({
      ...current,
      exportText: text,
    }));
  }

  async function showHandicapChallengeResults() {
    if (!d1Client) {
      updateState((current) => ({ ...current, flash: '四强之路需要 D1 API。' }));
      return;
    }

    updateState((current) => ({ ...current, flash: '正在生成四强之路...' }));

    try {
      const payload = await loadD1HandicapChallenge({ client: d1Client, groupCode });
      setHandicapDialog((current) => ({
        ...current,
        matches: payload.matches,
        predictionsByPlayer: payload.predictionsByPlayer,
        draft: current.open ? buildHandicapDraftFromPredictions(payload.predictionsByPlayer, state.selectedPlayerId) : current.draft,
        status: current.open ? 'ready' : current.status,
        error: '',
      }));
      const text = exportHandicapChallengeText({
        matches: payload.matches,
        players,
        predictionsByPlayer: payload.predictionsByPlayer,
        currentGroupUrl: window.location.href,
      });
      updateState((current) => ({
        ...current,
        exportText: text,
        flash: '四强之路已生成。',
      }));
    } catch (error) {
      updateState((current) => ({
        ...current,
        flash: error.message || '四强之路生成失败',
      }));
    }
  }

  async function showChampionRoadResults() {
    if (!d1Client) {
      updateState((current) => ({ ...current, flash: '冠军之路需要 D1 API。' }));
      return;
    }

    setMoreMenuOpen(false);
    updateState((current) => ({ ...current, flash: '正在生成冠军之路...' }));

    try {
      const payload = await loadD1ChampionRoad({ client: d1Client, groupCode });
      setChampionDialog((current) => ({
        ...current,
        teams: payload.teams,
        predictionsByPlayer: payload.predictionsByPlayer,
        draft: current.open ? buildChampionDraftFromPredictions(payload.predictionsByPlayer, state.selectedPlayerId, payload.teams) : current.draft,
        status: current.open ? 'ready' : current.status,
        locked: payload.locked,
        error: '',
      }));
      const text = exportChampionRoadText({
        teams: payload.teams,
        players,
        predictionsByPlayer: payload.predictionsByPlayer,
        currentGroupUrl: window.location.href,
      });
      updateState((current) => ({
        ...current,
        exportText: text,
        flash: '冠军之路已生成。',
      }));
    } catch (error) {
      updateState((current) => ({
        ...current,
        flash: error.message || '冠军之路生成失败',
      }));
    }
  }

  async function showAdvancementResults() {
    if (!d1Client) {
      updateState((current) => ({ ...current, flash: '晋级结果需要 D1 API。' }));
      return;
    }

    updateState((current) => ({ ...current, flash: '正在生成晋级结果...' }));

    try {
      const payload = await loadD1AdvancementPredictions({ client: d1Client, groupCode });
      const ties = await enrichAdvancementTiesWithLiveBoard(payload.ties);
      setAdvancementDialog((current) => ({
        ...current,
        ties,
        predictionsByPlayer: payload.predictionsByPlayer,
        draft: current.open ? buildAdvancementDraftFromPredictions(payload.predictionsByPlayer, state.selectedPlayerId) : current.draft,
        status: current.open ? 'ready' : current.status,
        error: '',
      }));
      const text = exportAdvancementPredictionsText({
        ties,
        players,
        predictionsByPlayer: payload.predictionsByPlayer,
        currentGroupUrl: window.location.href,
      });
      updateState((current) => ({
        ...current,
        exportText: text,
        flash: '晋级结果已生成。',
      }));
    } catch (error) {
      updateState((current) => ({
        ...current,
        flash: error.message || '晋级结果生成失败',
      }));
    }
  }

  async function enrichAdvancementTiesWithLiveBoard(ties) {
    const dates = (ties || []).map((tie) => tie.date).filter(Boolean).sort();
    if (!dates.length || !d1Client) return ties;
    try {
      const liveBoard = await loadD1LiveBoard({ client: d1Client, from: dates[0], to: dates[dates.length - 1] });
      return mergeAdvancementTiesWithMatches({ ties, matches: liveBoard.matches });
    } catch {
      return ties;
    }
  }

  function showAllTimeStats() {
    const text = exportAllTimeStatsText({
      matches,
      players,
      state,
      scoreOddsByMatch,
    });

    setMoreMenuOpen(false);
    setState((current) => ({
      ...current,
      exportText: text,
    }));
  }

  async function showBackendReports() {
    setMoreMenuOpen(false);
    if (staticSnapshot?.importReports?.length) {
      setReportDialog({
        open: true,
        status: 'ready',
        reports: staticSnapshot.importReports.slice(0, 8),
        error: '',
      });
      return;
    }

    if (!client) {
      setReportDialog({ open: true, status: 'error', reports: [], error: 'Supabase 配置缺失' });
      return;
    }

    setReportDialog({ open: true, status: 'loading', reports: [], error: '' });

    try {
      const reports = await loadImportReports({ client, limit: 8 });
      setReportDialog({ open: true, status: 'ready', reports, error: '' });
    } catch (error) {
      setReportDialog({
        open: true,
        status: 'error',
        reports: [],
        error: error.message || '后台报告加载失败',
      });
    }
  }

  async function showAiStrategyLeaderboard(page = 0) {
    setMoreMenuOpen(false);
    const availableStrategyStats = aiStrategyStats.length ? aiStrategyStats : (staticSnapshot?.aiStrategyStats || []);
    if (availableStrategyStats.length) {
      const result = getStaticAiStrategyStatsPage(availableStrategyStats, { page, pageSize: 6 });
      setStrategyRankDialog({
        open: true,
        status: 'ready',
        rows: result.rows,
        page: result.page,
        hasNext: result.hasNext,
        error: '',
      });
      return;
    }

    if (!client) {
      setStrategyRankDialog({ open: true, status: 'error', rows: [], page, hasNext: false, error: 'Supabase 配置缺失' });
      return;
    }

    setStrategyRankDialog((current) => ({ ...current, open: true, status: 'loading', page, error: '' }));

    try {
      const result = await loadAiStrategyStats({ client, page, pageSize: 6 });
      setStrategyRankDialog({
        open: true,
        status: 'ready',
        rows: result.rows,
        page: result.page,
        hasNext: result.hasNext,
        error: '',
      });
    } catch (error) {
      setStrategyRankDialog({
        open: true,
        status: 'error',
        rows: [],
        page,
        hasNext: false,
        error: error.message || 'AI预测排行榜加载失败',
      });
    }
  }

  async function showAiStrategyHitDetail(row) {
    setStrategyHitDetail({
      ...buildEmptyStrategyHitDetail(row),
      status: 'loading',
    });

    try {
      const detailIndex = await loadAiStrategyHitDetailsIndex();
      const rowSummary = buildEmptyStrategyHitDetail(row);
      const detail = getAiStrategyHitDetail(detailIndex, row);
      setStrategyHitDetail({
        ...rowSummary,
        hitMatches: detail?.hitMatches || 0,
        hits: detail?.hits || [],
        status: 'ready',
      });
    } catch {
      setStrategyHitDetail({
        ...buildEmptyStrategyHitDetail(row),
        status: 'error',
      });
    }
  }

  async function loadAiStrategyHitDetailsIndex() {
    if (aiStrategyHitDetailsIndexCache) return aiStrategyHitDetailsIndexCache;
    const response = await fetch('/ai-strategy-hit-details.json');
    if (!response.ok) throw new Error('strategy hit details unavailable');
    const seed = await response.json();
    aiStrategyHitDetailsIndexCache = buildAiStrategyHitDetailsIndex(seed);
    return aiStrategyHitDetailsIndexCache;
  }

  function buildEmptyStrategyHitDetail(row) {
    return {
      strategyName: row.strategyName,
      roiPercent: row.roi,
      cost: row.cost,
      revenue: row.revenue,
      netProfit: row.profit,
      hitMatches: 0,
      settledMatches: row.matchesCount,
      hits: [],
    };
  }

  async function submitAiStrategy() {
    if (!client) {
      setAiStrategyForm((current) => ({ ...current, status: 'error', error: 'Supabase 配置缺失' }));
      return;
    }

    setAiStrategyForm((current) => ({ ...current, status: 'saving', error: '' }));

    try {
      await submitAiUserStrategy({
        client,
        groupCode,
        authorName: aiStrategyForm.authorName || selectedPlayer?.name || '',
        strategyName: aiStrategyForm.strategyName,
        strategyPrompt: aiStrategyForm.strategyPrompt,
      });
      setAiStrategyForm({ authorName: '', strategyName: '', strategyPrompt: '', status: 'saved', error: '' });
      updateState((current) => ({ ...current, flash: 'AI策略已提交，我会后续回测它。' }));
    } catch (error) {
      setAiStrategyForm((current) => ({
        ...current,
        status: 'error',
        error: error.message || 'AI策略提交失败',
      }));
    }
  }

  async function confirmAddPlayer() {
    if (!d1Client && (!group || !client)) return;

    try {
      const player = d1Client
        ? await createD1GroupPlayer({
          client: d1Client,
          groupCode,
          name: state.newPlayerName || '',
        })
        : await createGroupPlayer({
          client,
          groupId: group.id,
          name: state.newPlayerName || '',
        });
      if (!player) return;

      const loaded = d1Client
        ? await loadD1GroupState({ client: d1Client, groupCode })
        : await loadGroupState({ client, groupCode });
      setPlayers(loaded.players);
      updateState((current) => ({
        ...current,
        predictions: loaded.predictions,
        selectedPlayerId: player.id,
        addingPlayer: false,
        newPlayerName: '',
        draftPicks: {},
      }));
    } catch (error) {
      updateState((current) => ({
        ...current,
        flash: error.message || '新增失败',
      }));
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>{dateLabel}比分预测</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" data-action="export" onClick={showExport}>
            比分结果
          </button>
          <button className="icon-button topbar-menu-button" data-action="more-menu" aria-label="更多" onClick={() => setMoreMenuOpen(true)}>
            ...
          </button>
        </div>
      </header>

      <section className="date-panel" aria-label="选择比赛日期">
        <div className="date-scroll">
          {dateTabs.map((tab) => (
            <button
              key={tab.date}
              ref={tab.date === selectedDate ? selectedDateButtonRef : null}
              className={`date-chip ${tab.date === selectedDate ? 'selected' : ''}`}
              data-match-date={tab.date}
              onClick={() => selectDate(tab.date)}
            >
              <span>{tab.label}</span>
              <small>{tab.count}场</small>
            </button>
          ))}
        </div>
      </section>

      <section className="player-panel" aria-label="用户名">
        <div className="section-title">
          <span>用户名</span>
          <strong>{selectedPlayer ? selectedPlayer.name : '未选择'}</strong>
        </div>
        <div className="player-grid">
          {selectablePlayers.map((player) => (
            <button
              key={player.id}
              className={`player-chip ${player.id === state.selectedPlayerId ? 'selected' : ''}`}
              data-player-id={player.id}
              onClick={() => selectPlayer(player.id)}
            >
              {player.name}
            </button>
          ))}
          <button
            className="player-chip add-player-chip"
            data-action="add-player"
            aria-label="新增名字"
            onClick={() => setState((current) => ({ ...current, addingPlayer: true, newPlayerName: '' }))}
          >
            +
          </button>
        </div>
      </section>

      <section className="advancement-entry-panel" aria-label="四强挑战入口">
        <button
          className="advancement-entry-button champion-entry-button"
          data-action="open-champion-road"
          disabled={!selectedPlayer}
          onClick={openChampionRoadDialog}
        >
          <span>
            <strong>冠军之路</strong>
            <small>拖动四队，排出冠军到第四名</small>
          </span>
          <em>
            {selectedPlayer
              ? (hasSavedChampionRanking ? `已排 ${championRankedCount}/${championDialog.teams.length}` : '去排序')
              : '先选用户名'}
          </em>
        </button>
      </section>

      {loadStatus !== 'ready' ? (
        <section className="status-panel" aria-label="加载状态">
          {loadStatus === 'loading' ? '正在加载群数据...' : errorMessage}
        </section>
      ) : null}

      <section className="match-board" aria-label="比赛预测">
        {visibleMatches.map((match) => {
          const aiRecommendation = getAiRecommendationForMatch(match.id);
          const dbAiRecommendation = aiRecommendationsByMatch[match.id];
          const recommendation = dbAiRecommendation || aiRecommendation;
          return (
            <MatchCard
              key={match.id}
              match={match}
              picks={selectedScores(match.id)}
              selectedPlayerId={state.selectedPlayerId}
              recommendedScores={recommendation?.scores || aiPredictions[match.id] || []}
              aiRecommendation={recommendation}
              strategyStats={aiStrategyStats}
              scoreOptions={buildScoreOptionsForMatch(scoreOddsByMatch[match.id])}
              onToggle={toggleMatchScore}
              onOpenAiRecommendation={setAiRecommendationDialog}
            />
          );
        })}
        {loadStatus === 'ready' && visibleMatches.length === 0 ? (
          <section className="status-panel" aria-label="暂无比赛">
            当天暂无比赛
          </section>
        ) : null}
      </section>

      <div className="submit-bar">
        <div className="submit-copy">
          {state.flash || (selectedPlayer ? '选好比分后保存预测' : '先选择你的名字')}
        </div>
        <button className="primary-button" data-action="submit" disabled={!selectedPlayer} onClick={submitAll}>
          确定录入
        </button>
      </div>

      {state.exportText ? (
        <ExportDialog
          text={state.exportText}
          onClose={() => setState((current) => ({ ...current, exportText: '' }))}
        />
      ) : null}

      {moreMenuOpen ? (
        <MoreMenuDialog
          onClose={() => setMoreMenuOpen(false)}
          onShowAllTimeStats={showAllTimeStats}
          onShowBackendReports={showBackendReports}
          onShowAiStrategyLeaderboard={() => showAiStrategyLeaderboard(0)}
          onOpenAdvancementPredictions={() => {
            setMoreMenuOpen(false);
            openAdvancementDialog();
          }}
          onShowAdvancementResults={() => {
            setMoreMenuOpen(false);
            showAdvancementResults();
          }}
          onShowHandicapChallengeResults={() => {
            setMoreMenuOpen(false);
            showHandicapChallengeResults();
          }}
          onShowChampionRoadResults={showChampionRoadResults}
          onOpenAiStrategy={() => {
            setMoreMenuOpen(false);
            setAiStrategyOpen(true);
          }}
          onOpenKnockoutStrategy={() => {
            setMoreMenuOpen(false);
            setKnockoutStrategyOpen(true);
          }}
        />
      ) : null}

      {aiStrategyOpen ? (
        <AiStrategyDialog
          form={aiStrategyForm}
          onChange={(patch) => setAiStrategyForm((current) => ({ ...current, ...patch, status: current.status === 'saved' ? 'idle' : current.status, error: '' }))}
          onClose={() => setAiStrategyOpen(false)}
          onSubmit={submitAiStrategy}
        />
      ) : null}

      {state.addingPlayer ? (
        <AddPlayerDialog
          name={state.newPlayerName || ''}
          onNameChange={(newPlayerName) => setState((current) => ({ ...current, newPlayerName }))}
          onClose={() => setState((current) => ({ ...current, addingPlayer: false, newPlayerName: '' }))}
          onConfirm={confirmAddPlayer}
        />
      ) : null}

      {createdHintOpen ? (
        <InfoDialog
          title="群链接已创建"
          message="点击“导出文本”可以保存本群链接，之后把这个链接发到微信群即可。"
          onClose={() => setCreatedHintOpen(false)}
        />
      ) : null}

      {reportDialog.open ? (
        <BackendReportDialog
          dialog={reportDialog}
          onClose={() => setReportDialog({ open: false, status: 'idle', reports: [], error: '' })}
        />
      ) : null}

      {strategyRankDialog.open ? (
        <AiStrategyLeaderboardDialog
          dialog={strategyRankDialog}
          onClose={() => setStrategyRankDialog({ open: false, status: 'idle', rows: [], page: 0, hasNext: false, error: '' })}
          onPageChange={showAiStrategyLeaderboard}
          onOpenDetail={showAiStrategyHitDetail}
        />
      ) : null}

      {strategyHitDetail ? (
        <AiStrategyHitDetailDialog
          detail={strategyHitDetail}
          onClose={() => setStrategyHitDetail(null)}
        />
      ) : null}

      {knockoutStrategyOpen ? (
        <KnockoutStrategyDialog onClose={() => setKnockoutStrategyOpen(false)} />
      ) : null}

      {advancementDialog.open ? (
        <AdvancementPredictionDialog
          dialog={advancementDialog}
          selectedCount={countAdvancementSelections(advancementDialog.draft, advancementDialog.ties)}
          totalCount={advancementDialog.ties.length}
          onSelect={selectAdvancementWinner}
          onClose={() => setAdvancementDialog((current) => ({ ...current, open: false }))}
          onSubmit={submitAdvancementPredictions}
        />
      ) : null}

      {handicapDialog.open ? (
        <HandicapChallengeDialog
          dialog={handicapDialog}
          selectedCount={countHandicapSelections(handicapDialog.draft, handicapDialog.matches)}
          totalCount={handicapDialog.matches.length}
          payout={calculateHandicapChallengePayout(handicapDialog.draft, handicapDialog.matches)}
          onSelect={selectHandicapChoice}
          onClose={() => setHandicapDialog((current) => ({ ...current, open: false }))}
          onSubmit={submitHandicapChallengePredictions}
        />
      ) : null}

      {championDialog.open ? (
        <ChampionRoadDialog
          dialog={championDialog}
          selectedCount={countChampionRankingSelections(championDialog.draft, championDialog.teams)}
          onMove={moveChampionTeam}
          onClose={() => setChampionDialog((current) => ({ ...current, open: false }))}
          onSubmit={submitChampionRoadPrediction}
        />
      ) : null}

      {aiRecommendationDialog ? (
        <AiRecommendationDialog
          recommendation={aiRecommendationDialog}
          onClose={() => setAiRecommendationDialog(null)}
        />
      ) : null}
    </main>
  );
}

function HomePage() {
  function createGroupLink() {
    const groupCode = generateGroupCode();
    window.sessionStorage.setItem('created-group-hint', groupCode);
    window.location.assign(`${window.location.pathname}?group=${groupCode}`);
  }

  return (
    <main className="home-shell" aria-label="创建群链接">
      <button className="primary-button home-create-button" data-action="create-group-link" onClick={createGroupLink}>
        创建群链接
      </button>
    </main>
  );
}

function InfoDialog({ title, message, onClose }) {
  return (
    <DialogBackdrop ariaLabel={title} onClose={onClose}>
      <div className="dialog compact-dialog info-dialog">
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" data-action="close-info" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <p>{message}</p>
        <button className="primary-button full-button" data-action="confirm-info" onClick={onClose}>
          知道了
        </button>
      </div>
    </DialogBackdrop>
  );
}

function buildAdvancementDraftFromPredictions(predictionsByPlayer, playerId) {
  const saved = playerId ? predictionsByPlayer?.[playerId] || {} : {};
  return Object.fromEntries(Object.entries(saved)
    .filter(([, prediction]) => ['home', 'away'].includes(prediction?.winnerSide))
    .map(([matchId, prediction]) => [matchId, prediction.winnerSide]));
}

function buildHandicapDraftFromPredictions(predictionsByPlayer, playerId) {
  const saved = playerId ? predictionsByPlayer?.[playerId] || {} : {};
  return Object.fromEntries(Object.entries(saved)
    .filter(([, prediction]) => handicapChoiceKeys.includes(prediction?.choiceKey))
    .map(([matchId, prediction]) => [matchId, prediction.choiceKey]));
}

function buildChampionDraftFromPredictions(predictionsByPlayer, playerId, teams = []) {
  const savedRanking = playerId ? predictionsByPlayer?.[playerId]?.ranking || [] : [];
  return isCompleteChampionRanking(savedRanking, teams)
    ? savedRanking
    : buildDefaultChampionRanking(teams);
}

function countChampionRankingSelections(ranking = [], teams = []) {
  return isCompleteChampionRanking(ranking, teams) ? ranking.length : 0;
}

function countHandicapSelections(draft = {}, matches = []) {
  const matchIds = new Set((matches || []).map((match) => match?.matchId).filter(Boolean));
  return Object.entries(draft || {})
    .filter(([matchId, choiceKey]) => matchIds.has(matchId) && handicapChoiceKeys.includes(choiceKey))
    .length;
}

function DialogBackdrop({ ariaLabel, onClose, children, dismissOnBackdrop = true }) {
  function handleBackdropClick(event) {
    if (!dismissOnBackdrop) return;
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={ariaLabel} onClick={handleBackdropClick}>
      {children}
    </div>
  );
}

function MoreMenuDialog({
  onClose,
  onShowAllTimeStats,
  onShowBackendReports,
  onShowAiStrategyLeaderboard,
  onOpenAdvancementPredictions,
  onShowAdvancementResults,
  onShowHandicapChallengeResults,
  onShowChampionRoadResults,
  onOpenAiStrategy,
  onOpenKnockoutStrategy,
}) {
  return (
    <DialogBackdrop ariaLabel="更多" onClose={onClose}>
      <div className="dialog compact-dialog more-menu-dialog" data-more-menu-dialog>
        <div className="dialog-header">
          <h2>更多</h2>
          <button className="icon-button" data-action="close-more-menu" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="more-menu-actions">
          <button className="menu-action-button" data-action="all-time-stats" onClick={onShowAllTimeStats}>
            总榜统计
          </button>
          <button className="menu-action-button" data-action="backend-report" onClick={onShowBackendReports}>
            后台报告
          </button>
          <button className="menu-action-button" data-action="ai-strategy-leaderboard" onClick={onShowAiStrategyLeaderboard}>
            AI排行榜
          </button>
          <button className="menu-action-button" data-action="open-advancement-predictions" onClick={onOpenAdvancementPredictions}>
            晋级预测
          </button>
          <button className="menu-action-button" data-action="advancement-results" onClick={onShowAdvancementResults}>
            晋级结果
          </button>
          <button className="menu-action-button" data-action="champion-road-results" onClick={onShowChampionRoadResults}>
            冠军之路结果
          </button>
          <button className="menu-action-button" data-action="handicap-results" onClick={onShowHandicapChallengeResults}>
            四强之路
          </button>
          <button className="menu-action-button" data-action="open-ai-strategy" onClick={onOpenAiStrategy}>
            AI策略
          </button>
          <button className="menu-action-button" data-action="open-knockout-strategy" onClick={onOpenKnockoutStrategy}>
            淘汰赛策略
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

function MatchCard({
  match,
  picks,
  selectedPlayerId,
  recommendedScores,
  aiRecommendation,
  strategyStats,
  scoreOptions,
  onToggle,
  onOpenAiRecommendation,
}) {
  const strategyTabs = useMemo(() => buildAiStrategyTabsForMatch({
    match,
    scoreOptions,
    routerRecommendation: aiRecommendation,
    strategyStats,
  }), [match, scoreOptions, aiRecommendation, strategyStats]);
  const defaultStrategyTabId = getDefaultAiStrategyTabId(strategyTabs, aiRecommendation);
  const [activeStrategyTabId, setActiveStrategyTabId] = useState(defaultStrategyTabId);

  useEffect(() => {
    setActiveStrategyTabId(defaultStrategyTabId);
  }, [defaultStrategyTabId, match.id]);

  const activeStrategyTab = strategyTabs.find((tab) => tab.id === activeStrategyTabId) || strategyTabs[0];
  const activeStrategyRecommendation = activeStrategyTab?.recommendation || aiRecommendation;
  const activeRecommendedScores = activeStrategyRecommendation?.scores || recommendedScores || [];
  const aiPreview = activeStrategyRecommendation
    ? getAiReasonPreview(activeStrategyRecommendation.matchReasonSummary, { roiLabel: activeStrategyRecommendation.roiLabel, summaryLimit: 42 })
    : null;

  return (
    <article className="match-card">
      <div className="match-header">
        <div>
          <p className="match-time">{match.time}</p>
          <h2>
            {match.home} <span>vs</span> {match.away}
          </h2>
          {activeStrategyRecommendation ? (
            <button
              className="ai-summary-button"
              data-action="open-ai-recommendation"
              onClick={() => onOpenAiRecommendation(activeStrategyRecommendation)}
            >
              <strong>AI推荐</strong>
              {activeStrategyRecommendation.roiLabel ? <span>· 历史[{activeStrategyRecommendation.roiLabel}]</span> : null}
              <span>· 理由 {aiPreview.summary}</span>
              <span aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>
        <div className="match-side">
          <div className="score-pill">{getMatchScoreText(match)}</div>
        </div>
      </div>
      {strategyTabs.length > 0 ? (
        <div className="ai-strategy-tabs" aria-label="AI策略类型">
          {strategyTabs.map((tab) => (
            <button
              key={tab.id}
              className={`ai-strategy-tab ${tab.id === activeStrategyTab?.id ? 'selected' : ''} ${tab.isRouterPick ? 'router-pick' : ''}`}
              data-ai-strategy-tab={tab.id}
              onClick={() => setActiveStrategyTabId(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.isRouterPick ? <small>推荐</small> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="score-grid">
        {scoreOptions.map((option) => {
          const isRecommended = activeRecommendedScores.includes(option.score);

          return (
            <button
              key={option.score}
              className={`score-chip ${picks.includes(option.score) ? 'selected' : ''} ${isRecommended ? 'ai-recommended' : ''} ${formatScoreTrendLabel(option) ? 'with-trend' : ''} ${isCorrectScoreOption(match, option) ? 'correct-result' : ''}`}
              data-match-id={match.id}
              data-score={option.score}
              disabled={!selectedPlayerId}
              onClick={() => onToggle(match.id, option.score)}
            >
              {isRecommended ? <span className="ai-recommendation-star" aria-label="AI推荐">★</span> : null}
              <span className="score-main-label">{formatScoreOptionLabel(option)}</span>
              {formatScoreTrendLabel(option) ? (
                <span className={`score-trend trend-${getScoreTrendDirection(option)}`}>
                  {formatScoreTrendLabel(option)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function AiRecommendationDialog({ recommendation, onClose }) {
  return (
    <DialogBackdrop ariaLabel="AI推荐详情" onClose={onClose}>
      <div className="dialog ai-detail-dialog" data-ai-recommendation-dialog>
        <div className="ai-detail-header">
          <button className="icon-button ai-back-button" data-action="close-ai-recommendation" aria-label="返回" onClick={onClose}>
            ‹
          </button>
          <div>
            <p>AI推荐</p>
            <h2>{recommendation.strategyName}</h2>
          </div>
          {recommendation.roiLabel ? <span className="ai-roi-badge">历史收益率 {recommendation.roiLabel}</span> : null}
        </div>

        <div className="ai-score-strip" aria-label="推荐结果">
          {(recommendation.scoreLabels || recommendation.scores).map((score) => (
            <span key={score}>{score}</span>
          ))}
        </div>

        <section className="ai-detail-section">
          <h3>本场摘要</h3>
          <p>{recommendation.matchReasonSummary}</p>
        </section>

        <section className="ai-detail-section">
          <h3>策略特点</h3>
          <p>{recommendation.strategyFeature}</p>
        </section>

        {recommendation.routerReason ? (
          <section className="ai-detail-section">
            <h3>Router 选择理由</h3>
            <p>{recommendation.routerReason}</p>
          </section>
        ) : null}

        <section className="ai-detail-section">
          <h3>本次预测</h3>
          <p>{recommendation.predictionSummary}</p>
        </section>

        <section className="ai-detail-section">
          <h3>完整说明</h3>
          <p>{recommendation.matchReasonDetail}</p>
        </section>
      </div>
    </DialogBackdrop>
  );
}

function AddPlayerDialog({ name, onNameChange, onClose, onConfirm }) {
  return (
    <DialogBackdrop ariaLabel="新增名字" onClose={onClose}>
      <div className="dialog compact-dialog">
        <div className="dialog-header">
          <h2>新增名字</h2>
          <button className="icon-button" data-action="close-add-player" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <input
          className="name-input"
          data-new-player-name
          value={name}
          placeholder="输入群友名字"
          autoFocus
          onChange={(event) => onNameChange(event.target.value)}
        />
        <button className="primary-button full-button" data-action="confirm-add-player" onClick={onConfirm}>
          确定新增
        </button>
      </div>
    </DialogBackdrop>
  );
}

function AdvancementPredictionDialog({ dialog, selectedCount, totalCount, onSelect, onClose, onSubmit }) {
  const saving = dialog.status === 'saving';

  return (
    <DialogBackdrop ariaLabel="8进4晋级预测" onClose={onClose}>
      <div className="dialog advancement-dialog" data-advancement-dialog>
        <div className="advancement-dialog-header">
          <button className="icon-button advancement-back-button" data-action="close-advancement" aria-label="返回" onClick={onClose}>
            ‹
          </button>
          <div>
            <h2>8进4晋级预测</h2>
            <p>开赛前15分钟锁定，允许先保存部分场次。</p>
          </div>
        </div>

        {dialog.status === 'loading' ? <div className="report-empty">正在读取8强对阵...</div> : null}
        {dialog.status === 'error' ? <div className="report-empty">{dialog.error}</div> : null}

        {dialog.status !== 'loading' && dialog.status !== 'error' ? (
          <div className="advancement-list">
            {dialog.ties.map((tie) => {
              const locked = tie.locked || isAdvancementTieLocked(tie);
              const selectedSide = dialog.draft?.[tie.matchId] || '';
              return (
                <article className={`advancement-tie-row ${locked ? 'locked' : ''}`} key={tie.matchId}>
                  <div className="advancement-tie-meta">
                    <span>{formatChinaDateLabel(tie.date)} {tie.time}</span>
                    <strong>{getAdvancementLockText({ locked })}</strong>
                  </div>
                  <div className="advancement-choice-row">
                    <button
                      className={`advancement-team-button ${selectedSide === 'home' ? 'selected' : ''}`}
                      disabled={locked}
                      data-advancement-match-id={tie.matchId}
                      data-winner-side="home"
                      onClick={() => onSelect(tie.matchId, 'home')}
                    >
                      {tie.home}
                    </button>
                    <span>vs</span>
                    <button
                      className={`advancement-team-button ${selectedSide === 'away' ? 'selected' : ''}`}
                      disabled={locked}
                      data-advancement-match-id={tie.matchId}
                      data-winner-side="away"
                      onClick={() => onSelect(tie.matchId, 'away')}
                    >
                      {tie.away}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {dialog.error && dialog.status !== 'error' ? <p className="form-status error">{dialog.error}</p> : null}

        <div className="advancement-submit-row">
          <span>已选 {selectedCount}/{totalCount || 8}</span>
          <button className="primary-button" data-action="save-advancement" disabled={saving || dialog.status === 'loading'} onClick={onSubmit}>
            {saving ? '保存中...' : '保存晋级'}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

function HandicapChallengeDialog({ dialog, selectedCount, totalCount, payout, onSelect, onClose, onSubmit }) {
  const saving = dialog.status === 'saving';

  return (
    <DialogBackdrop ariaLabel="四强之路" onClose={onClose}>
      <div className="dialog advancement-dialog handicap-dialog" data-handicap-dialog>
        <div className="advancement-dialog-header">
          <button className="icon-button advancement-back-button" data-action="close-handicap-challenge" aria-label="返回" onClick={onClose}>
            ‹
          </button>
          <div>
            <h2>四强之路</h2>
            <p>每场三选一，固定成本15覆盖全部组合。</p>
          </div>
        </div>

        {dialog.status === 'loading' ? <div className="report-empty">正在读取让球赔率...</div> : null}
        {dialog.status === 'error' ? <div className="report-empty">{dialog.error}</div> : null}

        {dialog.status !== 'loading' && dialog.status !== 'error' ? (
          <div className="advancement-list handicap-list">
            {dialog.matches.map((match) => {
              const locked = match.locked || isAdvancementTieLocked(match);
              const selectedChoice = dialog.draft?.[match.matchId] || '';
              const resultChoice = getHandicapResultChoice(match);
              return (
                <article className={`advancement-tie-row handicap-match-row ${locked ? 'locked' : ''}`} key={match.matchId}>
                  <div className="advancement-tie-meta">
                    <span>{formatChinaDateLabel(match.date)} {match.time}</span>
                    <strong>{locked ? '已锁定' : '可修改'}</strong>
                  </div>
                  <h3>{formatHandicapMatchLabel(match)}</h3>
                  <div className="handicap-choice-grid">
                    {handicapChoiceKeys.map((choiceKey) => {
                      const selected = selectedChoice === choiceKey;
                      const correct = resultChoice && resultChoice === choiceKey;
                      return (
                        <button
                          key={choiceKey}
                          className={`handicap-choice-button ${selected ? 'selected' : ''} ${correct ? 'correct-result' : ''}`}
                          disabled={locked}
                          data-handicap-match-id={match.matchId}
                          data-choice-key={choiceKey}
                          onClick={() => onSelect(match.matchId, choiceKey)}
                        >
                          <strong>{formatHandicapChoiceLabel(match, choiceKey)}</strong>
                          <span>{formatOdds(match.odds?.[choiceKey])}</span>
                          <small>{formatProbability(match.probabilities?.[choiceKey])}</small>
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {dialog.error && dialog.status !== 'error' ? <p className="form-status error">{dialog.error}</p> : null}

        <div className="advancement-submit-row handicap-submit-row">
          <div className="handicap-payout-summary">
            <span>已选 {selectedCount}/{totalCount || 4}</span>
            <strong className="handicap-payout-highlight">已赢{formatMaxPayoutOdds(payout.currentWonOdds)} · 最高可赢{formatMaxPayoutOdds(payout.maxPayoutOdds)}</strong>
            <small>固定成本15 · 15个组合</small>
          </div>
          <button className="primary-button" data-action="save-handicap-challenge" disabled={saving || dialog.status === 'loading'} onClick={onSubmit}>
            {saving ? '确认中...' : '确认挑战'}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

function ChampionRoadDialog({ dialog, selectedCount, onMove, onClose, onSubmit }) {
  const saving = dialog.status === 'saving';
  const locked = dialog.locked;
  const [draggingKey, setDraggingKey] = useState('');
  const teamsByKey = useMemo(() => new Map(dialog.teams.map((team) => [team.teamKey, team])), [dialog.teams]);
  const ranking = dialog.draft.length ? dialog.draft : buildDefaultChampionRanking(dialog.teams);

  useEffect(() => {
    if (!draggingKey) return undefined;

    function handlePointerMove(event) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-rank-team]');
      const targetKey = target?.getAttribute('data-rank-team');
      if (!targetKey || targetKey === draggingKey) return;
      const fromIndex = ranking.indexOf(draggingKey);
      const toIndex = ranking.indexOf(targetKey);
      if (fromIndex >= 0 && toIndex >= 0) onMove(fromIndex, toIndex);
    }

    function handlePointerUp() {
      setDraggingKey('');
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingKey, ranking, onMove]);

  return (
    <DialogBackdrop ariaLabel="冠军之路" onClose={onClose}>
      <div className="dialog advancement-dialog champion-road-dialog" data-champion-road-dialog>
        <div className="advancement-dialog-header">
          <button className="icon-button advancement-back-button" data-action="close-champion-road" aria-label="返回" onClick={onClose}>
            ‹
          </button>
          <div>
            <h2>冠军之路</h2>
            <p>按住拖动排序：第1名冠军，第2名亚军。</p>
          </div>
        </div>

        {dialog.status === 'loading' ? <div className="report-empty">正在读取四强球队...</div> : null}
        {dialog.status === 'error' ? <div className="report-empty">{dialog.error}</div> : null}

        {dialog.status !== 'loading' && dialog.status !== 'error' ? (
          <div className="champion-rank-list">
            {ranking.map((teamKey, index) => {
              const team = teamsByKey.get(teamKey);
              if (!team) return null;
              return (
                <article
                  className={`champion-rank-row ${draggingKey === teamKey ? 'dragging' : ''} ${locked ? 'locked' : ''}`}
                  key={teamKey}
                  data-rank-team={teamKey}
                >
                  <button
                    className="champion-drag-handle"
                    type="button"
                    aria-label={`拖动${team.name}`}
                    disabled={locked}
                    onPointerDown={(event) => {
                      if (locked) return;
                      event.preventDefault();
                      setDraggingKey(teamKey);
                    }}
                  >
                    ≡
                  </button>
                  <div className="champion-rank-number">{index + 1}</div>
                  <div className="champion-rank-name">
                    <strong>{team.name}</strong>
                    <span>{getChampionRankLabel(index)}</span>
                  </div>
                  <div className="champion-rank-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="上移"
                      disabled={locked || index === 0}
                      onClick={() => onMove(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="下移"
                      disabled={locked || index === ranking.length - 1}
                      onClick={() => onMove(index, index + 1)}
                    >
                      ↓
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {dialog.error && dialog.status !== 'error' ? <p className="form-status error">{dialog.error}</p> : null}

        <div className="advancement-submit-row champion-submit-row">
          <span>{locked ? '已锁定' : `已排 ${selectedCount}/${dialog.teams.length || 4}`}</span>
          <small>{getChampionRankingSummary(ranking, dialog.teams)}</small>
          <button className="primary-button" data-action="save-champion-road" disabled={saving || dialog.status === 'loading' || locked} onClick={onSubmit}>
            {saving ? '保存中...' : '保存排名'}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

function getChampionRankLabel(index) {
  return ['冠军', '亚军', '季军', '第四'][index] || `第${index + 1}名`;
}

function formatOdds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
}

function AiStrategyDialog({ form, onChange, onClose, onSubmit }) {
  const saving = form.status === 'saving';
  const saved = form.status === 'saved';

  return (
    <DialogBackdrop ariaLabel="AI策略" onClose={onClose} dismissOnBackdrop={false}>
      <div className="dialog strategy-dialog">
        <div className="dialog-header">
          <div>
            <h2>AI策略</h2>
            <p>输入你的策略，我会后续实现、回测并反馈。</p>
          </div>
          <button className="icon-button" data-action="close-ai-strategy" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <label>
          <span>昵称</span>
          <input
            className="name-input"
            value={form.authorName}
            placeholder="可选"
            onChange={(event) => onChange({ authorName: event.target.value })}
          />
        </label>

        <label>
          <span>策略名</span>
          <input
            className="name-input"
            value={form.strategyName}
            placeholder="例如：冷门保护"
            onChange={(event) => onChange({ strategyName: event.target.value })}
          />
        </label>

        <label>
          <span>策略内容</span>
          <textarea
            className="strategy-input"
            value={form.strategyPrompt}
            placeholder="写下你希望 AI 怎样选比分，例如：强队热门时买 2-0、2-1，再加一个平局保护。"
            onChange={(event) => onChange({ strategyPrompt: event.target.value })}
          />
        </label>

        {form.error ? <p className="form-status error">{form.error}</p> : null}
        {saved ? <p className="form-status success">已提交，等待回测。</p> : null}

        <button className="primary-button full-button" data-action="submit-ai-strategy" disabled={saving} onClick={onSubmit}>
          {saving ? '提交中...' : '提交策略'}
        </button>
      </div>
    </DialogBackdrop>
  );
}

function AiStrategyLeaderboardDialog({ dialog, onClose, onPageChange, onOpenDetail }) {
  return (
    <DialogBackdrop ariaLabel="AI预测排行榜" onClose={onClose}>
      <div className="dialog strategy-rank-dialog" data-ai-strategy-leaderboard-dialog>
        <div className="dialog-header">
          <h2>AI预测排行榜</h2>
          <button className="icon-button" data-action="close-ai-strategy-rank" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        {dialog.status === 'loading' ? <div className="report-empty">正在读取...</div> : null}
        {dialog.status === 'error' ? <div className="report-empty">{dialog.error}</div> : null}
        {dialog.status === 'ready' && dialog.rows.length === 0 ? <div className="report-empty">暂无 AI 策略回测结果</div> : null}

        {dialog.status === 'ready' && dialog.rows.length > 0 ? (
          <div className="strategy-rank-list">
            {dialog.rows.map((row, index) => {
              const rank = dialog.page * 6 + index + 1;
              const rankMeta = getAiStrategyRankMeta(rank);
              return (
                <article className={`strategy-rank-item ${rankMeta.top ? 'top-rank' : ''} ${rankMeta.className}`} key={row.strategyId}>
                  <div className="strategy-rank-header">
                    <strong>
                      {rankMeta.top ? <span className="strategy-rank-medal">{rankMeta.label}</span> : `${rank}.`}
                      {row.strategyName}
                    </strong>
                    <span>{formatPercent(row.roi)}</span>
                  </div>
                  <p>
                    净收益 {formatSignedNumber(row.profit)}
                    {' · '}
                    成本 {formatNumber(row.cost)}
                    {' · '}
                    返还 {formatNumber(row.revenue)}
                  </p>
                  <small>{row.matchesCount} 场比赛</small>
                  <button className="detail-link-button" data-action="open-ai-strategy-detail" onClick={() => onOpenDetail(row)}>
                    命中详情
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}

        <div className="pager-actions">
          <button className="ghost-button" disabled={dialog.page <= 0 || dialog.status === 'loading'} onClick={() => onPageChange(dialog.page - 1)}>
            上一页
          </button>
          <span>第 {dialog.page + 1} 页</span>
          <button className="ghost-button" disabled={!dialog.hasNext || dialog.status === 'loading'} onClick={() => onPageChange(dialog.page + 1)}>
            下一页
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

function AiStrategyHitDetailDialog({ detail, onClose }) {
  return (
    <DialogBackdrop ariaLabel="策略命中详情" onClose={onClose}>
      <div className="dialog strategy-hit-dialog" data-ai-strategy-hit-detail-dialog>
        <div className="dialog-header">
          <div>
            <h2>{detail.strategyName}</h2>
            <p>按单场 ROI 从高到低展示命中场次</p>
          </div>
          <button className="icon-button" data-action="close-ai-strategy-hit-detail" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="strategy-hit-summary">
          <span>{formatHitDetailRoi(detail.roiPercent)}</span>
          <span>净收益 {formatSignedNumber(detail.netProfit)}</span>
          <span>命中 {detail.hitMatches}/{detail.settledMatches}</span>
          <span>成本 {formatNumber(detail.cost)}</span>
        </div>

        {detail.status === 'loading' ? (
          <div className="report-empty">正在读取命中明细...</div>
        ) : null}
        {detail.status === 'error' ? (
          <div className="report-empty">命中明细暂时读不到</div>
        ) : null}
        {detail.status !== 'loading' && detail.status !== 'error' && detail.hits.length === 0 ? (
          <div className="report-empty">暂无可展示的命中明细</div>
        ) : null}
        {detail.status !== 'loading' && detail.status !== 'error' && detail.hits.length > 0 ? (
          <div className="strategy-hit-list">
            {detail.hits.map((hit) => (
              <article className="strategy-hit-row" key={`${hit.matchId}-${hit.hitScore}`}>
                <div className="strategy-hit-row-main">
                  <strong>{hit.date} {hit.time} {hit.match}</strong>
                  <span>{hit.actualScore} · 命中 {hit.hitScore}({formatNumber(hit.hitOdds)})</span>
                </div>
                <div className="strategy-hit-row-side">
                  <strong>单场 {formatHitDetailRoi(hit.matchRoi)}</strong>
                  <span>成本 {formatNumber(hit.cost)} · 返还 {formatNumber(hit.revenue)} · 净 {formatSignedNumber(hit.netProfit)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </DialogBackdrop>
  );
}

function KnockoutStrategyDialog({ onClose }) {
  const families = useMemo(() => getKnockoutStrategyFamilies(), []);
  const metricLabels = useMemo(() => getKnockoutMetricLabels(), []);
  const [selectedMetric, setSelectedMetric] = useState('roi');
  const selectedMetricLabel = metricLabels.find((metric) => metric.id === selectedMetric)?.label || '分项';

  return (
    <DialogBackdrop ariaLabel="淘汰赛策略" onClose={onClose}>
      <div className="dialog knockout-strategy-dialog" data-knockout-strategy-dialog>
        <div className="dialog-header">
          <div>
            <h2>淘汰赛策略</h2>
            <p>代理样本评分，失败实验也保留在曲线上。</p>
          </div>
          <button className="icon-button" data-action="close-knockout-strategy" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="knockout-family-grid">
          {families.map((family) => {
            const activeVersion = family.versions.find((version) => version.status === 'active') || family.versions.at(-1);
            return (
              <article className="knockout-family-card" key={family.id} style={{ '--family-color': family.color }}>
                <div>
                  <strong>{family.name}</strong>
                  <span>{activeVersion.version} · {activeVersion.totalScore}分</span>
                </div>
                <p>{family.thesis}</p>
              </article>
            );
          })}
        </div>

        <section className="strategy-chart-section" data-knockout-total-chart>
          <div className="chart-section-header">
            <h3>总分演进</h3>
            <span>ROI 35 / 命中 20 / 覆盖 15 / 形态 15 / 解释 15</span>
          </div>
          <StrategyEvolutionChart
            series={getKnockoutVersionPoints(families, 'total')}
            metricLabel="总分"
          />
        </section>

        <section className="strategy-chart-section" data-knockout-metric-chart>
          <div className="chart-section-header">
            <h3>{selectedMetricLabel}走势</h3>
            <span>切换分项观察每次实验的得失</span>
          </div>
          <div className="metric-tabs" aria-label="选择分项指标">
            {metricLabels.filter((metric) => metric.id !== 'total').map((metric) => (
              <button
                key={metric.id}
                className={metric.id === selectedMetric ? 'selected' : ''}
                onClick={() => setSelectedMetric(metric.id)}
              >
                {metric.label}
              </button>
            ))}
          </div>
          <StrategyEvolutionChart
            series={getKnockoutVersionPoints(families, selectedMetric)}
            metricLabel={selectedMetricLabel}
          />
        </section>

        <section className="strategy-version-list" aria-label="版本记录">
          {families.map((family) => (
            <div className="strategy-family-history" key={family.id}>
              <h3>{family.name}</h3>
              {family.versions.map((version) => (
                <article className={`strategy-version-item ${version.status}`} key={`${family.id}-${version.version}`}>
                  <div>
                    <strong>{version.version} · {version.label}</strong>
                    <span>{getVersionStatusLabel(version.status)} · 总分 {version.totalScore}</span>
                  </div>
                  <p>{version.changed}</p>
                  <small>{version.verdict}</small>
                </article>
              ))}
            </div>
          ))}
        </section>
      </div>
    </DialogBackdrop>
  );
}

function StrategyEvolutionChart({ series, metricLabel }) {
  const width = 320;
  const height = 168;
  const padding = { top: 18, right: 20, bottom: 26, left: 32 };
  const allValues = series.flatMap((item) => item.points.map((point) => point.value));
  const minValue = Math.max(0, Math.floor((Math.min(...allValues, 0) - 8) / 10) * 10);
  const maxValue = Math.min(100, Math.ceil((Math.max(...allValues, 100) + 8) / 10) * 10);
  const maxIndex = Math.max(...series.map((item) => item.points.length - 1), 1);

  function xFor(index) {
    return padding.left + (index / maxIndex) * (width - padding.left - padding.right);
  }

  function yFor(value) {
    const ratio = (Number(value) - minValue) / Math.max(1, maxValue - minValue);
    return height - padding.bottom - ratio * (height - padding.top - padding.bottom);
  }

  return (
    <div className="strategy-chart" aria-label={`${metricLabel}折线图`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line className="chart-axis" x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
        <line className="chart-axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
        <text className="chart-tick" x={padding.left - 8} y={yFor(maxValue) + 4} textAnchor="end">{maxValue}</text>
        <text className="chart-tick" x={padding.left - 8} y={yFor(minValue) + 4} textAnchor="end">{minValue}</text>

        {series.map((item) => {
          const path = item.points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.x)} ${yFor(point.value)}`)
            .join(' ');
          return (
            <g key={item.familyId}>
              <path className="chart-line" d={path} style={{ stroke: item.color }} />
              {item.points.map((point) => (
                <g key={`${item.familyId}-${point.version}`}>
                  <circle
                    className={`chart-point ${point.status}`}
                    cx={xFor(point.x)}
                    cy={yFor(point.value)}
                    r={point.status === 'discarded' ? 4.2 : 5}
                    style={{ stroke: item.color, fill: point.status === 'discarded' ? '#ffffff' : item.color }}
                  />
                  <text className="chart-version-label" x={xFor(point.x)} y={height - 8} textAnchor="middle">{point.version}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.familyId}>
            <i style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function getVersionStatusLabel(status) {
  if (status === 'active') return '当前候选';
  if (status === 'discarded') return '失败实验';
  return '基线版本';
}

function getAiStrategyRankMeta(rank) {
  if (rank === 1) return { top: true, label: 'TOP 1', className: 'rank-first' };
  if (rank === 2) return { top: true, label: 'TOP 2', className: 'rank-second' };
  if (rank === 3) return { top: true, label: 'TOP 3', className: 'rank-third' };
  return { top: false, label: String(rank), className: '' };
}

function ExportDialog({ text, onClose }) {
  const [copyStatus, setCopyStatus] = useState('idle');

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <DialogBackdrop ariaLabel="导出文本" onClose={onClose}>
      <div className="dialog">
        <div className="dialog-header">
          <h2>复制到微信群</h2>
          <div className="dialog-actions">
            <button className="copy-button" data-action="copy-export" onClick={copyText}>
              {getCopyStatusText(copyStatus)}
            </button>
            <button className="icon-button" data-action="close-export" aria-label="关闭" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <textarea readOnly data-export-text value={text} />
      </div>
    </DialogBackdrop>
  );
}

function BackendReportDialog({ dialog, onClose }) {
  return (
    <DialogBackdrop ariaLabel="后台报告" onClose={onClose}>
      <div className="dialog report-dialog" data-backend-report-dialog>
        <div className="dialog-header">
          <h2>后台报告</h2>
          <button className="icon-button" data-action="close-report" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        {dialog.status === 'loading' ? (
          <div className="report-empty">正在读取...</div>
        ) : null}

        {dialog.status === 'error' ? (
          <div className="report-empty">{dialog.error}</div>
        ) : null}

        {dialog.status === 'ready' && dialog.reports.length === 0 ? (
          <div className="report-empty">暂无后台报告</div>
        ) : null}

        {dialog.status === 'ready' && dialog.reports.length > 0 ? (
          <div className="report-list">
            {dialog.reports.map((report) => (
              <article className={`report-item ${report.status}`} key={report.id}>
                <div className="report-item-header">
                  <strong>{formatReportJobTitle(report)}</strong>
                  <span>{formatReportStatusText(report)}</span>
                </div>
                <p>{report.message || '无消息'}</p>
                <small>
                  {formatReportTime(report.finishedAt || report.createdAt)}
                  {` · ${report.itemsSeen}项 · 写入${report.rowsWritten}行`}
                </small>
                {report.errorDetail ? <pre>{report.errorDetail.slice(0, 420)}</pre> : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </DialogBackdrop>
  );
}

function formatReportTime(value) {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPercent(value) {
  return `${Number(value) > 0 ? '+' : ''}${formatNumber(value)}%`;
}

function formatSignedNumber(value) {
  return `${Number(value) > 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatNumber(value) {
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
