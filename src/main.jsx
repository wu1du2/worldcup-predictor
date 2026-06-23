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
  loadImportReports,
  loadGroupState,
  loadMatches,
  loadScoreOdds,
  saveGroupPredictions,
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
  const [aiReasonDialog, setAiReasonDialog] = useState(null);
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
      const [loaded, loadedScoreOdds] = await Promise.all([
        loadGroupState({ client, groupCode }),
        loadScoreOdds({ client, matches: loadedMatches }),
      ]);
      const availableDates = new Set(loadedMatches.map((match) => match.date));
      setGroup(loaded.group);
      setPlayers(loaded.players);
      setMatches(loadedMatches);
      setScoreOddsByMatch(loadedScoreOdds);
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

  const selectedPlayer = players.find((player) => player.id === state.selectedPlayerId);
  const selectedPlayerIsAi = isAiPlayer(selectedPlayer);
  const dateTabs = buildDateTabs(matches);
  const selectedDate = state.selectedDate || getDefaultMatchDateCn(matches);
  const visibleMatches = matches.filter((match) => match.date === selectedDate);
  const dateLabel = selectedDate ? formatChinaDateLabel(selectedDate) : '暂无赛程';
  const inviteDate = selectedDate ? getNextMatchDateCn(matches, selectedDate) : '';
  const inviteMatches = inviteDate ? matches.filter((match) => match.date === inviteDate) : [];
  const inviteDateLabel = inviteDate ? formatChinaDateLabel(inviteDate) : '';

  if (!groupCode) {
    return <HomePage />;
  }

  useEffect(() => {
    selectedDateButtonRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }, [selectedDate, dateTabs.length]);

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
            导出文本
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
          {players.map((player) => (
            <button
              key={player.id}
              className={`player-chip ${isAiPlayer(player) ? 'ai-player-chip' : ''} ${player.id === state.selectedPlayerId ? 'selected' : ''}`}
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
        {visibleMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            picks={selectedScores(match.id)}
            selectedPlayerId={state.selectedPlayerId}
            isAiSelected={selectedPlayerIsAi}
            aiRecommendation={selectedPlayerIsAi ? getAiRecommendationForMatch(match.id) : null}
            onOpenAiReason={setAiReasonDialog}
            scoreOptions={scoreOddsByMatch[match.id] || fallbackScoreOptions}
            onToggle={toggleMatchScore}
          />
        ))}
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

      {aiReasonDialog ? (
        <AiReasonDialog
          dialog={aiReasonDialog}
          onClose={() => setAiReasonDialog(null)}
        />
      ) : null}

      {moreMenuOpen ? (
        <MoreMenuDialog
          onClose={() => setMoreMenuOpen(false)}
          onShowAllTimeStats={showAllTimeStats}
          onShowBackendReports={showBackendReports}
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

function MoreMenuDialog({ onClose, onShowAllTimeStats, onShowBackendReports }) {
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
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  picks,
  selectedPlayerId,
  isAiSelected,
  aiRecommendation,
  onOpenAiReason,
  scoreOptions,
  onToggle,
}) {
  const aiReason = aiRecommendation?.reason
    ? getAiReasonPreview(aiRecommendation.reason, { roiLabel: aiRecommendation.roiLabel })
    : null;

  return (
    <article className="match-card">
      <div className="match-header">
        <div>
          <p className="match-time">{match.time}</p>
          <h2>
            {match.home} <span>vs</span> {match.away}
          </h2>
          {isAiSelected && aiReason ? (
            <button
              className="ai-reason-inline"
              type="button"
              onClick={() => onOpenAiReason({ match, recommendation: aiRecommendation })}
            >
              <span className="ai-reason-inline-copy">
                {aiReason.roiText ? <span className="ai-roi-badge">{aiReason.roiText}</span> : null}
                <span className="ai-reason-summary">{aiReason.summary}</span>
              </span>
              <strong>查看</strong>
            </button>
          ) : null}
        </div>
        <div className="match-side">
          <div className="score-pill">{getMatchScoreText(match)}</div>
        </div>
      </div>
      <div className="score-grid">
        {scoreOptions.map((option) => (
          <button
            key={option.score}
            className={`score-chip ${picks.includes(option.score) ? 'selected' : ''} ${isAiSelected && picks.includes(option.score) ? 'ai-selected' : ''} ${formatScoreTrendLabel(option) ? 'with-trend' : ''} ${isCorrectScoreOption(match, option) ? 'correct-result' : ''}`}
            data-match-id={match.id}
            data-score={option.score}
            disabled={!selectedPlayerId}
            onClick={() => onToggle(match.id, option.score)}
          >
            <span className="score-main-label">{formatScoreOptionLabel(option)}</span>
            {formatScoreTrendLabel(option) ? (
              <span className={`score-trend trend-${getScoreTrendDirection(option)}`}>
                {formatScoreTrendLabel(option)}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </article>
  );
}

function AiReasonDialog({ dialog, onClose }) {
  const preview = getAiReasonPreview(dialog.recommendation.reason, {
    roiLabel: dialog.recommendation.roiLabel,
  });

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="AI推荐理由">
      <div className="dialog ai-reason-dialog" data-ai-reason-dialog>
        <div className="dialog-header ai-reason-dialog-header">
          <div>
            <p className="eyebrow">AI推荐理由</p>
            <h2>
              {dialog.match.home} <span>vs</span> {dialog.match.away}
            </h2>
          </div>
          <button className="ai-reason-close-button" type="button" onClick={onClose}>
            返回
          </button>
        </div>
        <div className="ai-reason-dialog-body">
          {preview.roiText ? <span className="ai-roi-badge">{preview.roiText}</span> : null}
          <p>{preview.detail}</p>
        </div>
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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
