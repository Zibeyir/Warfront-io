// == BACKEND CODE ==

// Import Required Packages
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect('mongodb+srv://zibeyira:jXC6ridjtyB8nmZA@cluster0.rqp6v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
});
const RoomSchema = new mongoose.Schema({
  name: String,
  players: [String], // List of player usernames
});

const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);

// Routes for Login and Signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).send('User registered');
  } catch (err) {
    res.status(400).send('Username already exists');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).send('User not found');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).send('Invalid password');

  res.status(200).send('Login successful');
});

// Socket.IO Logic
const rooms = {}; // Active rooms and their states
// Game Logic
const playerColors = {}; // Store unique player colors
const goldZones = [
  { x: 300, y: 300, radius: 50 }, // Example gold zone
  { x: 500, y: 400, radius: 50 },
];
const distanceDelay = 5;
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  const initialX = Math.random() * 800;
  const initialY = Math.random() * 600;
  const playerDistanceBall = 50;
  // Join Room
  socket.on('joinRoom', async ({ username, roomName }) => {
    let room = await Room.findOne({ name: roomName });

    if (!room) {
      room = new Room({ name: roomName, players: [] });
      await room.save();
    }

    if (room.players.length >= 2) {
      socket.emit('roomFull', 'Room is full');
      return;
    }

    room.players.push(username);
    await room.save();
    socket.join(roomName);

    if (!rooms[roomName]) {
      rooms[roomName] = { players: {}, gameStarted: false };
    }
    playerColors[socket.id] = getRandomColor();

    const initialX = Math.random() * 800;
    const initialY = Math.random() * 600;
    rooms[roomName].players[socket.id] = [
        { x: initialX, y: initialY, radius: 20, score: 50, targetX: null, targetY: null, increaseScore: 2 },
        { x: initialX - playerDistanceBall, y: initialY - playerDistanceBall, radius: 20, score: 50, targetX: null, targetY: null },
        { x: initialX + playerDistanceBall, y: initialY - playerDistanceBall, radius: 20, score: 50, targetX: null, targetY: null },
        { x: initialX - playerDistanceBall, y: initialY + playerDistanceBall, radius: 20, score: 50, targetX: null, targetY: null },
        { x: initialX + playerDistanceBall, y: initialY + playerDistanceBall, radius: 20, score: 50, targetX: null, targetY: null },
      ];
    
    // Notify other players
    io.to(roomName).emit('playerJoined', {
      players: Object.values(rooms[roomName].players), playerColors, goldZones
    });

    // Start game if room has 4 players
    if (room.players.length >= 1) {
      rooms[roomName].gameStarted = true;
      io.to(roomName).emit('startGame', {
        players: rooms[roomName].players,playerColors, goldZones 
      });
    }
  });

  socket.on('moveSoldier', ({ roomName, soldierIndex, targetX, targetY }) => {
    if (!rooms[roomName] || !rooms[roomName].players[socket.id]) return;

    const player = rooms[roomName].players[socket.id];
    if (!player.soldiers || !player.soldiers[soldierIndex]) return;

    // Update soldier's position
    player.soldiers[soldierIndex].x = targetX;
    player.soldiers[soldierIndex].y = targetY;

    // Notify all players in the room
    io.to(roomName).emit('soldierMoved', {
      playerId: socket.id,
      soldierIndex,
      targetX,
      targetY,
    });
  });
// Periodically increase ball scores
setInterval(() => {
    for (const roomName in rooms) {
    for (const playerId in rooms[roomName].players) {
        rooms[roomName].players[playerId].forEach((ball) => {
        ball.score += ball.increaseScore;
        ball.radius = 20 + ball.score * 0.1; // Increase size with score
  
        // Change ball image based on score thresholds
        if (ball.score >= 500) {
          ball.image = "images/ball500.png";
        } else if (ball.score >= 300) {
          ball.image = "images/ball300.png";
        } else if (ball.score >= 100) {
          ball.image = "images/ball100.png";
        } else {
          ball.image = "images/ball50.png";
        }
      });
    }}
  }, 4000); // Every 4 seconds
  setInterval(() => {
    for (const roomName in rooms) {
    for (const playerId in rooms[roomName].players) {
        rooms[roomName].players[playerId].forEach((ball, ballIndex) => {
        // Movement logic
        if (ball.targetX !== null && ball.targetY !== null) {
          const dx = ball.targetX - ball.x;
          const dy = ball.targetY - ball.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
  
          if (distance > 1) {
            const speed = 2;
            ball.x += (dx / distance) * speed;
            ball.y += (dy / distance) * speed;
          } else {
            ball.targetX = null;
            ball.targetY = null;
          }
        }
  
        // Check if ball is in a gold zone
        goldZones.forEach((zone) => {
          const dx = zone.x - ball.x;
          const dy = zone.y - ball.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
  
          if (distance < zone.radius) {
            ball.increaseScore=6; // Increase score 3x faster in gold zones
          }else{
            ball.increaseScore=2;
          }
        });
  
        // Collision logic
        for (const otherPlayerId in rooms[roomName].players) {
          if (playerId !== otherPlayerId) {
            rooms[roomName].players[otherPlayerId].forEach((otherBall, otherBallIndex) => {
              const dx = otherBall.x - ball.x;
              const dy = otherBall.y - ball.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
  
              if (distance < ball.radius + otherBall.radius+distanceDelay) {
                const damage = 0.5; // Gradual score decrease on collision
                ball.score = Math.max(0, ball.score - damage);
                otherBall.score = Math.max(0, otherBall.score - damage);
  
                // Update size based on score
                ball.radius = 20 + ball.score * 0.1;
                otherBall.radius = 20 + otherBall.score * 0.1;
  
                // Handle ball death
                if (ball.score === 0) {
                    rooms[roomName].players[otherPlayerId].push({
                    x: ball.x,
                    y: ball.y,
                    radius: 20,
                    score: 50,
                    targetX: null,
                    targetY: null,
                    image: "images/ball50.png",
                  });
                  rooms[roomName].players[playerId].splice(ballIndex, 1);
                }
  
                if (otherBall.score === 0) {
                    rooms[roomName].players[playerId].push({
                    x: otherBall.x,
                    y: otherBall.y,
                    radius: 20,
                    score: 50,
                    targetX: null,
                    targetY: null,
                    image: "images/ball50.png",
                  });
                  rooms[roomName].players[otherPlayerId].splice(otherBallIndex, 1);
                }
              }
            });
          }
        }
      });
    }
}
    io.emit('stateUpdate', { playplayers: Object.values(rooms[roomName].players), playerColors, goldZones });
  }, 16); // ~60 FPS
  // Disconnect
  socket.on('disconnect', async () => {
    for (const roomName in rooms) {
      if (rooms[roomName].players[socket.id]) {
        delete rooms[roomName].players[socket.id];

        // Update MongoDB room data
        const room = await Room.findOne({ name: roomName });
        if (room) {
          room.players = room.players.filter(
            (player) => player !== rooms[roomName].players[socket.id].username
          );
          await room.save();
        }

        io.to(roomName).emit('playerLeft', {
          players: Object.values(rooms[roomName].players),
        });
        break;
      }
    }
  });
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});