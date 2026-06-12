import {
  addCustomPlayer,
  createInitialState,
  exportPredictionsText,
  submitPrediction,
  toggleScorePick,
} from './predictionStore.mjs';

const storageKey = 'worldcup-prediction-stage1';

const players = [
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
  '0-0',
  '1-0',
  '0-1',
  '1-1',
  '2-0',
  '0-2',
  '2-1',
  '1-2',
  '2-2',
  '3-0',
  '0-3',
  '3-1',
  '1-3',
  '3-2',
  '2-3',
  '其他',
];

const app = document.querySelector('#app');
let state = loadState();

function allPlayers() {
  return [...players, ...(state.customPlayers || [])];
}

function loadState() {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return createInitialState();

  try {
    return { ...createInitialState(), ...JSON.parse(saved) };
  } catch {
    return createInitialState();
  }
}

function saveState() {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function selectedScores(matchId) {
  const playerId = state.selectedPlayerId;
  if (!playerId) return state.draftPicks[matchId] || [];
  return state.draftPicks[matchId] || state.predictions[playerId]?.[matchId] || [];
}

function setSelectedPlayer(playerId) {
  state = {
    ...state,
    selectedPlayerId: playerId,
    draftPicks: {},
  };
  saveState();
  render();
}

function toggleMatchScore(matchId, score) {
  if (!state.selectedPlayerId) return;

  state = {
    ...state,
    draftPicks: {
      ...state.draftPicks,
      [matchId]: toggleScorePick(selectedScores(matchId), score),
    },
  };
  saveState();
  render();
}

function submitAll() {
  if (!state.selectedPlayerId) return;

  let nextState = state;
  for (const match of matches) {
    const scores = selectedScores(match.id);
    if (scores.length > 0) {
      nextState = submitPrediction(nextState, {
        playerId: state.selectedPlayerId,
        matchId: match.id,
        scores,
      });
    }
  }

  state = {
    ...nextState,
    draftPicks: {},
    flash: '已保存，可以回群里继续催大家交卷。',
  };
  saveState();
  render();
}

function showExport() {
  const currentPlayers = allPlayers();
  const text = exportPredictionsText({
    dateLabel: '6月13日',
    matches,
    players: currentPlayers,
    state,
  });

  state = {
    ...state,
    exportText: text,
  };
  render();
}

function showAddPlayer() {
  state = { ...state, addingPlayer: true, newPlayerName: '' };
  render();
}

function closeAddPlayer() {
  state = { ...state, addingPlayer: false, newPlayerName: '' };
  render();
}

function updateNewPlayerName(name) {
  state = { ...state, newPlayerName: name };
}

function confirmAddPlayer() {
  state = addCustomPlayer(state, state.newPlayerName || '');
  state = { ...state, addingPlayer: false, newPlayerName: '' };
  saveState();
  render();
}

function closeExport() {
  state = { ...state, exportText: '' };
  render();
}

function render() {
  const currentPlayers = allPlayers();
  const selectedPlayer = currentPlayers.find((player) => player.id === state.selectedPlayerId);

  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">明天比赛</p>
        <h1>6月13日波胆预测</h1>
      </div>
      <button class="ghost-button" data-action="export">导出文本</button>
    </header>

    <section class="player-panel" aria-label="选择自己">
      <div class="section-title">
        <span>选择自己</span>
        <strong>${selectedPlayer ? selectedPlayer.name : '未选择'}</strong>
      </div>
      <div class="player-grid">
        ${currentPlayers
          .map(
            (player) => `
              <button
                class="player-chip ${player.id === state.selectedPlayerId ? 'selected' : ''}"
                data-player-id="${player.id}"
              >${player.name}</button>
            `,
          )
          .join('')}
        <button class="player-chip add-player-chip" data-action="add-player" aria-label="新增名字">+</button>
      </div>
    </section>

    <section class="match-board" aria-label="比赛预测">
      ${matches.map(renderMatch).join('')}
    </section>

    <div class="submit-bar">
      <div class="submit-copy">
        ${state.flash || (selectedPlayer ? '选好比分后保存预测' : '先选择你的名字')}
      </div>
      <button class="primary-button" data-action="submit" ${selectedPlayer ? '' : 'disabled'}>确定录入</button>
    </div>

    ${state.exportText ? renderExportDialog(state.exportText) : ''}
    ${state.addingPlayer ? renderAddPlayerDialog() : ''}
  `;
}

function renderMatch(match) {
  const picks = selectedScores(match.id);
  const currentPlayers = allPlayers();
  const predictionCount = currentPlayers.filter((player) => state.predictions[player.id]?.[match.id]?.length).length;

  return `
    <article class="match-card">
      <div class="match-header">
        <div>
          <p class="match-time">${match.time}</p>
          <h2>${match.home} <span>vs</span> ${match.away}</h2>
        </div>
        <div class="count-pill">${predictionCount}/${currentPlayers.length}</div>
      </div>
      <div class="score-grid">
        ${scoreOptions
          .map(
            (score) => `
              <button
                class="score-chip ${picks.includes(score) ? 'selected' : ''}"
                data-match-id="${match.id}"
                data-score="${score}"
                ${state.selectedPlayerId ? '' : 'disabled'}
              >${score}</button>
            `,
          )
          .join('')}
      </div>
    </article>
  `;
}

function renderAddPlayerDialog() {
  return `
    <div class="dialog-backdrop" role="dialog" aria-modal="true" aria-label="新增名字">
      <div class="dialog compact-dialog">
        <div class="dialog-header">
          <h2>新增名字</h2>
          <button class="icon-button" data-action="close-add-player" aria-label="关闭">×</button>
        </div>
        <input class="name-input" data-new-player-name value="${escapeAttribute(state.newPlayerName || '')}" placeholder="输入群友名字" autofocus />
        <button class="primary-button full-button" data-action="confirm-add-player">确定新增</button>
      </div>
    </div>
  `;
}

function renderExportDialog(text) {
  return `
    <div class="dialog-backdrop" role="dialog" aria-modal="true" aria-label="导出文本">
      <div class="dialog">
        <div class="dialog-header">
          <h2>复制到微信群</h2>
          <button class="icon-button" data-action="close-export" aria-label="关闭">×</button>
        </div>
        <textarea readonly data-export-text>${text}</textarea>
      </div>
    </div>
  `;
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const playerId = target.dataset.playerId;
  if (playerId) {
    setSelectedPlayer(playerId);
    return;
  }

  const matchId = target.dataset.matchId;
  const score = target.dataset.score;
  if (matchId && score) {
    toggleMatchScore(matchId, score);
    return;
  }

  const action = target.dataset.action;
  if (action === 'submit') submitAll();
  if (action === 'export') showExport();
  if (action === 'close-export') closeExport();
  if (action === 'add-player') showAddPlayer();
  if (action === 'close-add-player') closeAddPlayer();
  if (action === 'confirm-add-player') confirmAddPlayer();
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.dataset.newPlayerName !== undefined) {
    updateNewPlayerName(target.value);
  }
});

render();
