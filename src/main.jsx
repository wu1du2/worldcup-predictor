import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  createInitialState,
  exportPredictionsText,
  formatScoreOptionLabel,
  getCopyStatusText,
  toggleScorePick,
} from './predictionStore.mjs';
import {
  createGroupPlayer,
  createSupabaseBrowserClient,
  getGroupCodeFromSearch,
  loadImportReports,
  loadGroupState,
  loadMatches,
  loadScoreOdds,
  saveGroupPredictions,
} from './supabaseData.mjs';
import { formatReportStatusText } from './importReports.mjs';
import { buildDateTabs, formatChinaDateLabel, getDefaultMatchDateCn, getMatchScoreText } from './matchSchedule.mjs';
import './styles.css';

const storageKey = 'worldcup-prediction-stage2';

const fallbackScoreOptions = [
  { score: '0-0' },
  { score: '1-0' },
  { score: '0-1' },
  { score: '1-1' },
  { score: '2-0' },
  { score: '0-2' },
  { score: '2-1' },
  { score: '1-2' },
  { score: '2-2' },
  { score: '3-0' },
  { score: '0-3' },
  { score: '3-1' },
  { score: '1-3' },
  { score: '3-2' },
  { score: '2-3' },
  { score: '其他' },
];

function loadState() {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return createInitialState();

  try {
    return { ...createInitialState(), ...JSON.parse(saved) };
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
    refreshGroupState();
  }, [client, groupCode]);

  function updateState(updater) {
    setState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  const selectedPlayer = players.find((player) => player.id === state.selectedPlayerId);
  const dateTabs = buildDateTabs(matches);
  const selectedDate = state.selectedDate || getDefaultMatchDateCn(matches);
  const visibleMatches = matches.filter((match) => match.date === selectedDate);
  const dateLabel = selectedDate ? formatChinaDateLabel(selectedDate) : '暂无赛程';

  useEffect(() => {
    selectedDateButtonRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }, [selectedDate, dateTabs.length]);

  function selectedScores(matchId, currentState = state) {
    const playerId = currentState.selectedPlayerId;
    if (!playerId) return currentState.draftPicks[matchId] || [];
    return currentState.draftPicks[matchId] || currentState.predictions[playerId]?.[matchId] || [];
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
      currentGroupUrl: window.location.href,
    });

    setState((current) => ({
      ...current,
      exportText: text,
    }));
  }

  async function showBackendReports() {
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
          <button className="icon-button topbar-menu-button" data-action="backend-report" aria-label="后台报告" onClick={showBackendReports}>
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
        {visibleMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            picks={selectedScores(match.id)}
            selectedPlayerId={state.selectedPlayerId}
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

      {state.addingPlayer ? (
        <AddPlayerDialog
          name={state.newPlayerName || ''}
          onNameChange={(newPlayerName) => setState((current) => ({ ...current, newPlayerName }))}
          onClose={() => setState((current) => ({ ...current, addingPlayer: false, newPlayerName: '' }))}
          onConfirm={confirmAddPlayer}
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

function MatchCard({ match, picks, selectedPlayerId, scoreOptions, onToggle }) {
  return (
    <article className="match-card">
      <div className="match-header">
        <div>
          <p className="match-time">{match.time}</p>
          <h2>
            {match.home} <span>vs</span> {match.away}
          </h2>
        </div>
        <div className="match-side">
          <div className="score-pill">{getMatchScoreText(match)}</div>
        </div>
      </div>
      <div className="score-grid">
        {scoreOptions.map((option) => (
          <button
            key={option.score}
            className={`score-chip ${picks.includes(option.score) ? 'selected' : ''}`}
            data-match-id={match.id}
            data-score={option.score}
            disabled={!selectedPlayerId}
            onClick={() => onToggle(match.id, option.score)}
          >
            {formatScoreOptionLabel(option)}
          </button>
        ))}
      </div>
    </article>
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
