import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
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
import { formatReportStatusText } from './importReports.mjs';
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
import { sportteryScoreTemplate } from './scoreTemplate.mjs';
import './styles.css';

const storageKey = 'worldcup-prediction-stage2';

const fallbackScoreOptions = sportteryScoreTemplate.map((score) => ({ score }));

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
  const [aiStrategyOpen, setAiStrategyOpen] = useState(false);
  const [aiStrategyForm, setAiStrategyForm] = useState({ authorName: '', strategyName: '', strategyPrompt: '', status: 'idle', error: '' });
  const [strategyRankDialog, setStrategyRankDialog] = useState({ open: false, status: 'idle', rows: [], page: 0, hasNext: false, error: '' });
  const selectedDateButtonRef = useRef(null);
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const groupCode = getGroupCodeFromSearch(window.location.search);

  async function refreshGroupState() {
    if (!client) {
      setLoadStatus('error');
      setErrorMessage('Supabase 配置缺失');
      return;
    }

    setLoadStatus('loading');
    setErrorMessage('');

    try {
      const loadedMatches = await loadMatches({ client });
      const [loaded, loadedScoreOdds, loadedAiRecommendations] = await Promise.all([
        loadGroupState({ client, groupCode }),
        loadScoreOdds({ client, matches: loadedMatches }),
        loadAiRecommendations({ client }),
      ]);
      const availableDates = new Set(loadedMatches.map((match) => match.date));
      setGroup(loaded.group);
      setPlayers(loaded.players);
      setMatches(loadedMatches);
      setScoreOddsByMatch(loadedScoreOdds);
      setAiRecommendationsByMatch(loadedAiRecommendations);
      updateState((current) => ({
        ...current,
        selectedPlayerId: current.groupCode === groupCode ? current.selectedPlayerId : '',
        draftPicks: current.groupCode === groupCode ? current.draftPicks : {},
        predictions: loaded.predictions,
        groupCode,
        selectedDate: availableDates.has(current.selectedDate) ? current.selectedDate : getDefaultMatchDateCn(loadedMatches),
      }));
      setLoadStatus('ready');
    } catch (error) {
      setLoadStatus('error');
      setErrorMessage(error.message || '加载失败');
    }
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
    if (!state.selectedPlayerId || !group || !client) return;

    const entries = visibleMatches
      .map((match) => ({ matchId: match.id, scores: selectedScores(match.id) }))
      .filter((entry) => entry.scores.length > 0);

    updateState((current) => ({ ...current, flash: '保存中...' }));

    try {
      await saveGroupPredictions({
        client,
        groupId: group.id,
        playerId: state.selectedPlayerId,
        entries,
      });
      const loaded = await loadGroupState({ client, groupCode });
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
    if (!group || !client) return;

    try {
      const player = await createGroupPlayer({
        client,
        groupId: group.id,
        name: state.newPlayerName || '',
      });
      if (!player) return;

      const loaded = await loadGroupState({ client, groupCode });
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
              scoreOptions={scoreOddsByMatch[match.id] || fallbackScoreOptions}
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
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
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
    </div>
  );
}

function MoreMenuDialog({ onClose, onShowAllTimeStats, onShowBackendReports, onOpenAiStrategy }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="更多">
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
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  picks,
  selectedPlayerId,
  recommendedScores,
  aiRecommendation,
  scoreOptions,
  onToggle,
  onOpenAiRecommendation,
}) {
  const aiPreview = aiRecommendation
    ? getAiReasonPreview(aiRecommendation.matchReasonSummary, { roiLabel: aiRecommendation.roiLabel, summaryLimit: 42 })
    : null;

  return (
    <article className="match-card">
      <div className="match-header">
        <div>
          <p className="match-time">{match.time}</p>
          <h2>
            {match.home} <span>vs</span> {match.away}
          </h2>
          {aiRecommendation ? (
            <button
              className="ai-summary-button"
              data-action="open-ai-recommendation"
              onClick={() => onOpenAiRecommendation(aiRecommendation)}
            >
              <strong>AI推荐</strong>
              <span>· 历史[{aiRecommendation.roiLabel}]</span>
              <span>· 理由 {aiPreview.summary}</span>
              <span aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>
        <div className="match-side">
          <div className="score-pill">{getMatchScoreText(match)}</div>
        </div>
      </div>
      <div className="score-grid">
        {scoreOptions.map((option) => {
          const isRecommended = recommendedScores.includes(option.score);

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
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="AI推荐详情">
      <div className="dialog ai-detail-dialog" data-ai-recommendation-dialog>
        <div className="ai-detail-header">
          <button className="icon-button ai-back-button" data-action="close-ai-recommendation" aria-label="返回" onClick={onClose}>
            ‹
          </button>
          <div>
            <p>AI推荐</p>
            <h2>{recommendation.strategyName}</h2>
          </div>
          <span className="ai-roi-badge">历史收益率 {recommendation.roiLabel}</span>
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

        <section className="ai-detail-section">
          <h3>Router 选择理由</h3>
          <p>{recommendation.routerReason}</p>
        </section>

        <section className="ai-detail-section">
          <h3>本次预测</h3>
          <p>{recommendation.predictionSummary}</p>
        </section>

        <section className="ai-detail-section">
          <h3>完整说明</h3>
          <p>{recommendation.matchReasonDetail}</p>
        </section>
      </div>
    </div>
  );
}

function AddPlayerDialog({ name, onNameChange, onClose, onConfirm }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="新增名字">
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
    </div>
  );
}

function AiStrategyDialog({ form, onChange, onClose, onSubmit }) {
  const saving = form.status === 'saving';
  const saved = form.status === 'saved';

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="AI策略">
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
    </div>
  );
}

function AiStrategyLeaderboardDialog({ dialog, onClose, onPageChange }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="AI预测排行榜">
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
    </div>
  );
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
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="导出文本">
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
    </div>
  );
}

function BackendReportDialog({ dialog, onClose }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="后台报告">
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
                  <strong>{report.jobName === 'odds' ? '赔率更新' : '比分更新'}</strong>
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
    </div>
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
