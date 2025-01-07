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

let playerColors = {};
let myId = null;
let selected = false;
let selectedBallNum = 0;
let closestBallIndex = -1;
let goldZones = [];
let mapSize = { width: 4000, height: 4000 }; // Larger map size
let camera = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };

// Dynamically adjust canvas size

// Load images for balls
const ballImages = {
    "images/ball50.png": new Image(),
    "images/ball100.png": new Image(),
    "images/ball300.png": new Image(),
    "images/ball500.png": new Image(),
};
ballImages["images/ball50.png"].src = "/images/ball50.png";
ballImages["images/ball100.png"].src = "/images/ball100.png";
ballImages["images/ball300.png"].src = "/images/ball300.png";
ballImages["images/ball500.png"].src = "/images/ball500.png";

// Load gold zone image
const goldZoneImage = new Image();
goldZoneImage.src = "/images/gold_zone.png";

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

  
  draw();

 
}

// Helper Functions
function handleClick(event, camera) {
  console.log("click");
  const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left + camera.x;
    const y = event.clientY - rect.top + camera.y;

    // Find the closest ball to move
    const mySoldiers = players[socket.id];

    if (mySoldiers) {

      // Find the closest ball
      let closestDistance = Infinity;

      mySoldiers.forEach((ball, index) => {
        const dx = ball.x - x;
        const dy = ball.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < ball.radius) {
          closestDistance = distance;
          closestBallIndex = index;
          selected = true;
          selectedBallNum++;
          console.log("Distance"+selected+" "+selectedBallNum+" "+closestBallIndex);
        }
      });
      console.log("Finish 1 :"+selected+" "+selectedBallNum+" "+closestBallIndex);

      if (selectedBallNum===0 && selected && closestBallIndex !== -1) {

        socket.emit('moveSoldier', {
          soldierIndex: closestBallIndex,
          targetX: x,
          targetY: y,
          roomName: elements.roomNameInput.value,
        });
        selected = false;
        closestBallIndex = -1;

      }
      selectedBallNum=0;

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



function removeDefeatedPlayer({ targetId }) {
  delete players[targetId];
}

function draw() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const myBalls = players[socket.id];
  if (myBalls && myBalls.length > 0) {
      const avgX = myBalls.reduce((sum, ball) => sum + ball.x, 0) / myBalls.length;
      const avgY = myBalls.reduce((sum, ball) => sum + ball.y, 0) / myBalls.length;

      camera.x = Math.max(0, Math.min(mapSize.width - camera.width, avgX - camera.width / 2));
      camera.y = Math.max(0, Math.min(mapSize.height - camera.height, avgY - camera.height / 2));
  }

  // Draw gold zones
  goldZones.forEach((zone) => {
      const drawX = zone.x - zone.radius - camera.x;
      const drawY = zone.y - zone.radius - camera.y;

      ctx.drawImage(
          goldZoneImage,
          drawX,
          drawY,
          zone.radius * 2,
          zone.radius * 2
      );
  });

  // Draw players and balls
  for (const playerId in players) {
      const balls = players[playerId];
      const color = playerColors[playerId];

      balls.forEach((ball) => {
          const drawX = ball.x - ball.radius - camera.x;
          const drawY = ball.y - ball.radius - camera.y;

          const image = ballImages[ball.image];
          if (image) {
              ctx.drawImage(
                  image,
                  drawX,
                  drawY,
                  ball.radius * 2,
                  ball.radius * 2
              );
          } else {
              // Fallback: Draw a circle if image is missing
              //ctx.fillStyle = color;
              //ctx.beginPath();
              //ctx.arc(drawX + ball.radius, drawY + ball.radius, ball.radius, 0, Math.PI * 2);
              //ctx.fill();
          }

          // Draw score inside the ball
          ctx.fillStyle = "#000";
          ctx.font = "12px Arial";
          ctx.textAlign = "center";
          ctx.fillText(Math.round(ball.score), drawX + ball.radius, drawY +2 );
      });
  }

  requestAnimationFrame(draw);
}
socket.on("stateUpdate", (data) => {
  players = data.players;
  playerColors = data.playerColors;
  goldZones = data.goldZones;
});

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

window.addEventListener('beforeunload', () => {
  socket.disconnect();
});