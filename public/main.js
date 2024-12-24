const socket = io();

let username;

// Constants
const elements = {
  authError: document.getElementById('auth-error'),
  lobbyError: document.getElementById('lobby-error'),
  players: document.getElementById('players'),
  roomNameInput: document.getElementById('roomName'),
  authDiv: document.getElementById('auth'),
  lobbyDiv: document.getElementById('lobby'),
  gameDiv: document.getElementById('game'),
  usernameInput: document.getElementById('username'),
  passwordInput: document.getElementById('password'),
};

// Event Listeners
document.getElementById('signup').addEventListener('click', () => handleAuth('signup'));
document.getElementById('login').addEventListener('click', () => handleAuth('login'));
document.getElementById('joinRoom').addEventListener('click', joinRoom);
let selectedSoldier = null;

// Authentication Logic
async function handleAuth(action) {
  const user = elements.usernameInput.value;
  const pass = elements.passwordInput.value;
  const url = `/${action}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });

    if (response.ok) {
      if (action === 'login') {
        username = user;
        elements.authDiv.style.display = 'none';
        elements.lobbyDiv.style.display = 'block';
      }
      alert(`${capitalizeFirstLetter(action)} successful!`);
    } else {
      elements.authError.innerText = `${capitalizeFirstLetter(action)} failed.`;
    }
  } catch (error) {
    elements.authError.innerText = 'An error occurred. Please try again.';
  }
}

// Lobby Logic
function joinRoom() {
  const roomName = elements.roomNameInput.value;
  socket.emit('joinRoom', { username, roomName });

  socket.on('roomFull', message => {
    elements.lobbyError.innerText = message;
  });

  socket.on('playerJoined', data => {
    elements.players.innerText = `Players in room: ${data.players.map(p => p.username).join(', ')}`;
  });

  socket.on('startGame', data => {
    console.log("Game starting: ", data);
    elements.lobbyDiv.style.display = 'none';
    elements.gameDiv.style.display = 'block';
    players = data.players;
    startGame();
  });
}

// Game Logic
function startGame() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 600;
  canvas.height = 400;

  const playerRadius = 20;
  const camera = { x: 0, y: 0 };
  selectedSoldier = null;

  canvas.addEventListener('click', event => handleClick(event, camera));
  socket.on('soldierMoved', updateSoldierPosition);
  socket.on('playerAttacked', updatePlayerSoldiers);
  socket.on('playerDefeated', removeDefeatedPlayer);
  
  draw();

  document.addEventListener('keydown', event => {
    const direction = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }[event.key];

    if (direction) {
      //socket.emit('move', { roomName: elements.roomNameInput.value, direction });
    }
  });
}

// Helper Functions
function handleClick(event, camera) {
  const canvas = document.getElementById('gameCanvas');
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left + camera.x;
  const y = event.clientY - rect.top + camera.y;

  const mySoldiers = players[socket.id]?.soldiers;

  if (mySoldiers) {
    if (selectedSoldier === null) {
      selectSoldier(mySoldiers, x, y);
    } else {
      moveSelectedSoldier(x, y);
    }
  }
}

function selectSoldier(mySoldiers, x, y) {
  for (let i = 0; i < mySoldiers.length; i++) {
    const soldier = mySoldiers[i];
    const distance = Math.sqrt((soldier.x - x) ** 2 + (soldier.y - y) ** 2);
    
    if (distance < soldier.radius) {
      selectedSoldier = i;
      console.log(`Soldier ${i} selected`);
      break;
    }
  }
}

function moveSelectedSoldier(x, y) {
  socket.emit('moveSoldier', {
    soldierIndex: selectedSoldier,
    targetX: x,
    targetY: y,
    roomName: elements.roomNameInput.value,
  });
  selectedSoldier = null; // Deselect after movement
}

function updateSoldierPosition({ playerId, soldierIndex, targetX, targetY }) {
  if (!players[playerId]) return;
  const soldier = players[playerId].soldiers[soldierIndex];
  if (soldier) {
    soldier.x = targetX;
    soldier.y = targetY;
  }
}

function updatePlayerSoldiers({ targetId, remainingSoldiers }) {
  if (players[targetId]) {
    players[targetId].soldiers = remainingSoldiers;
  }
}

function removeDefeatedPlayer({ targetId }) {
  delete players[targetId];
}

function draw() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const id in players) {
    const { soldiers } = players[id];
    soldiers.forEach(({ x, y, radius }, index) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = id === socket.id ? 'blue' : 'red'; // Different colors for self and others
      ctx.fill();
      ctx.closePath();

      ctx.fillStyle = 'black';
      ctx.fillText(`S${index}`, x - 10, y - radius - 5); // Label soldiers
    });
  }

  requestAnimationFrame(draw);
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
