const socket = io();

let username;

// Authentication
document.getElementById('signup').addEventListener('click', async () => {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;

  const response = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });

  if (response.ok) {
    alert('Signup successful! Log in now.');
  } else {
    document.getElementById('auth-error').innerText = 'Signup failed.';
  }
});

document.getElementById('login').addEventListener('click', async () => {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;

  const response = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });

  if (response.ok) {
    username = user;
    document.getElementById('auth').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
  } else {
    document.getElementById('auth-error').innerText = 'Login failed.';
  }
});

// Lobby
document.getElementById('joinRoom').addEventListener('click', () => {
  const roomName = document.getElementById('roomName').value;

  socket.emit('joinRoom', { username, roomName });

  socket.on('roomFull', (message) => {
    document.getElementById('lobby-error').innerText = message;
  });

  socket.on('playerJoined', (data) => {
    document.getElementById('players').innerText = `Players in room: ${
      data.players.map((p) => p.username).join(', ')
    }`;
  });

  socket.on('startGame', (data) => {
    console.log("start game : "+data);
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    players = data.players; // Initialize the players object with server data
    startGame();
  });
});

// Game
function startGame() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 600;
  canvas.height = 400;

  const playerRadius = 20;
console.log("game start");
  const camera = { x: 0, y: 0 }; // Adjust if implementing a camera system
  let selectedSoldier = null; // To track the selected soldier
  
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left + camera.x;
    const y = event.clientY - rect.top + camera.y;
  
    const mySoldiers = players[socket.id]?.soldiers;
  
    if (mySoldiers) {
      if (!selectedSoldier) {
        // Select a soldier if none is selected
        for (let i = 0; i < mySoldiers.length; i++) {
          const soldier = mySoldiers[i];
          const dx = soldier.x - x;
          const dy = soldier.y - y;
          const distance = Math.sqrt(dx * dx + dy * dy);
  
          if (distance < soldier.radius) {
            selectedSoldier = i;
            console.log(`Soldier ${i} selected`);
            break;
          }
        }
      } else {
        // Move selected soldier to the clicked position
        socket.emit('moveSoldier', {
          soldierIndex: selectedSoldier,
          targetX: x,
          targetY: y,
          roomName: document.getElementById('roomName').value,
        });
        selectedSoldier = null; // Deselect after movement
      }
    }
  });
  
  // Handle soldier movement updates
  socket.on('soldierMoved', ({ playerId, soldierIndex, targetX, targetY }) => {
    if (!players[playerId]) return;
    const soldier = players[playerId].soldiers[soldierIndex];
    if (soldier) {
      soldier.x = targetX;
      soldier.y = targetY;
    }
  });

  socket.on('playerAttacked', ({ targetId, remainingSoldiers }) => {
    if (players[targetId]) {
      players[targetId].soldiers = remainingSoldiers;
    }
  });

  socket.on('playerDefeated', ({ targetId }) => {
    delete players[targetId];
  });

  function draw() {
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
  

  draw();

  document.addEventListener('keydown', (event) => {
    const direction = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }[event.key];

    if (direction) {
      socket.emit('move', { roomName: document.getElementById('roomName').value, direction });
    }
  });
}
//mongodb+srv://<db_username>:<db_password>@cluster0.goy5n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0   jXC6ridjtyB8nmZA   zibeyira
//mongodb+srv://zibeyira:<db_password>@cluster0.rqp6v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0