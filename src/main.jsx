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
  loadGroupState,
  loadMatches,
  saveGroupPredictions,
} from './supabaseData.mjs';
import { buildDateTabs, formatChinaDateLabel, getDefaultMatchDateCn, getMatchScoreText } from './matchSchedule.mjs';
import './styles.css';

const storageKey = 'worldcup-prediction-stage2';

const scoreOptions = [
  { score: '0-0', odds: 9.5 },
  { score: '1-0', odds: 7.2 },
  { score: '0-1', odds: 8.0 },
  { score: '1-1', odds: 6.5 },
  { score: '2-0', odds: 9.0 },
  { score: '0-2', odds: 10.5 },
  { score: '2-1', odds: 8.5 },
  { score: '1-2', odds: 9.5 },
  { score: '2-2', odds: 12.0 },
  { score: '3-0', odds: 18.0 },
  { score: '0-3', odds: 21.0 },
  { score: '3-1', odds: 16.0 },
  { score: '1-3', odds: 19.0 },
  { score: '3-2', odds: 23.0 },
  { score: '2-3', odds: 26.0 },
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
  const [group, setGroup] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
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
      const [loaded, loadedMatches] = await Promise.all([
        loadGroupState({ client, groupCode }),
        loadMatches({ client }),
      ]);
      const availableDates = new Set(loadedMatches.map((match) => match.date));
      setGroup(loaded.group);
      setPlayers(loaded.players);
      setMatches(loadedMatches);
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
    });

    setState((current) => ({
      ...current,
      exportText: text,
    }));
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
          <p className="eyebrow">北京时间 · {groupCode}</p>
          <h1>{dateLabel}比分预测</h1>
        </div>
        <button className="ghost-button" data-action="export" onClick={showExport}>
          导出文本
        </button>
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

      <section className="player-panel" aria-label="选择自己">
        <div className="section-title">
          <span>选择自己</span>
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
    </main>
  );
}

function MatchCard({ match, picks, selectedPlayerId, onToggle }) {
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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
