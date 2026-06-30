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
  loadD1LiveBoard,
  loadD1GroupState,
  saveD1GroupPredictions,
} from './d1Data.mjs';
import { formatReportJobTitle, formatReportStatusText } from './importReports.mjs';
import { buildLiveDateWindow } from './liveWindow.mjs';
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
  const selectedDateButtonRef = useRef(null);
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
      setMatches(loadedMatches);
      if (!snapshot?.matches.length) {
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
      hydrateLiveBoardFromD1();
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

  function hydrateLiveBoardFromD1() {
    if (!d1Client) return;
    const liveWindow = buildLiveDateWindow(new Date(), 2);
    void loadD1LiveBoard({ client: d1Client, from: liveWindow.from, to: liveWindow.to })
      .then((liveBoard) => {
        setMatches((currentMatches) => mergeLiveBoardSnapshot({ matches: currentMatches }, liveBoard).matches);
        setScoreOddsByMatch((currentOdds) => ({
          ...currentOdds,
          ...(liveBoard.scoreOddsByMatch || {}),
        }));
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
            预测结果
          </button>
          <button className="ghost-button ai-strategy-button" data-action="ai-strategy-leaderboard" onClick={() => showAiStrategyLeaderboard(0)}>
            AI排行榜
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

function MoreMenuDialog({ onClose, onShowAllTimeStats, onShowBackendReports, onOpenAiStrategy, onOpenKnockoutStrategy }) {
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
