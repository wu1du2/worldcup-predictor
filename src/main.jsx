import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  addCustomPlayer,
  createInitialState,
  exportPredictionsText,
  formatScoreOptionLabel,
  getCopyStatusText,
  submitPrediction,
  toggleScorePick,
} from './predictionStore.mjs';
import './styles.css';

const storageKey = 'worldcup-prediction-stage1';

const defaultPlayers = [
  { id: 'p01', name: '阿哲' },
  { id: 'p02', name: '北北' },
  { id: 'p03', name: '大宇' },
  { id: 'p04', name: '小林' },
  { id: 'p05', name: '老周' },
  { id: 'p06', name: 'Mia' },
  { id: 'p07', name: 'Kevin' },
  { id: 'p08', name: 'Nina' },
  { id: 'p09', name: 'Tony' },
  { id: 'p10', name: 'Yuki' },
];

const matches = [
  { id: 'm01', date: '2026-06-13', time: '03:00', home: '德国', away: '日本' },
  { id: 'm02', date: '2026-06-13', time: '18:00', home: '西班牙', away: '巴西' },
  { id: 'm03', date: '2026-06-13', time: '21:00', home: '阿根廷', away: '法国' },
];

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

  function updateState(updater) {
    setState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  const players = [...defaultPlayers, ...(state.customPlayers || [])];
  const selectedPlayer = players.find((player) => player.id === state.selectedPlayerId);

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

  function submitAll() {
    if (!state.selectedPlayerId) return;

    updateState((current) => {
      let next = current;
      for (const match of matches) {
        const scores = selectedScores(match.id, current);
        if (scores.length > 0) {
          next = submitPrediction(next, {
            playerId: current.selectedPlayerId,
            matchId: match.id,
            scores,
          });
        }
      }

      return {
        ...next,
        draftPicks: {},
        flash: '已保存，可以回群里继续催大家交卷。',
      };
    });
  }

  function showExport() {
    const text = exportPredictionsText({
      dateLabel: '6月13日',
      matches,
      players,
      state,
    });

    setState((current) => ({
      ...current,
      exportText: text,
    }));
  }

  function confirmAddPlayer() {
    updateState((current) => ({
      ...addCustomPlayer(current, current.newPlayerName || ''),
      addingPlayer: false,
      newPlayerName: '',
    }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">明天比赛</p>
          <h1>6月13日波胆预测</h1>
        </div>
        <button className="ghost-button" data-action="export" onClick={showExport}>
          导出文本
        </button>
      </header>

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

      <section className="match-board" aria-label="比赛预测">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            picks={selectedScores(match.id)}
            players={players}
            predictions={state.predictions}
            selectedPlayerId={state.selectedPlayerId}
            onToggle={toggleMatchScore}
          />
        ))}
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

function MatchCard({ match, picks, players, predictions, selectedPlayerId, onToggle }) {
  const predictionCount = players.filter((player) => predictions[player.id]?.[match.id]?.length).length;

  return (
    <article className="match-card">
      <div className="match-header">
        <div>
          <p className="match-time">{match.time}</p>
          <h2>
            {match.home} <span>vs</span> {match.away}
          </h2>
        </div>
        <div className="count-pill">
          {predictionCount}/{players.length}
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
