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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join Room
  socket.on('joinRoom', async ({ username, roomName }) => {
    let room = await Room.findOne({ name: roomName });

    if (!room) {
      room = new Room({ name: roomName, players: [] });
      await room.save();
    }

    if (room.players.length >= 4) {
      socket.emit('roomFull', 'Room is full');
      return;
    }

    room.players.push(username);
    await room.save();
    socket.join(roomName);

    if (!rooms[roomName]) {
      rooms[roomName] = { players: {}, gameStarted: false };
    }
    rooms[roomName].players[socket.id] = {
        username,
        soldiers: Array(4).fill().map(() => ({
          x: Math.random() * 600, // Random initial position within the canvas
          y: Math.random() * 400,
          radius: 20, // Display size
        })),
        score: 0,
      };
    // Notify other players
    io.to(roomName).emit('playerJoined', {
      players: Object.values(rooms[roomName].players),
    });

    // Start game if room has 4 players
    if (room.players.length >= 3) {
      rooms[roomName].gameStarted = true;
      io.to(roomName).emit('startGame', {
        players: rooms[roomName].players,
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
  

  // Combat Logic
  socket.on('attack', ({ roomName, targetId }) => {
    if (!rooms[roomName] || !rooms[roomName].players[socket.id]) return;
    if (!rooms[roomName].players[targetId]) return;

    const attacker = rooms[roomName].players[socket.id];
    const target = rooms[roomName].players[targetId];

    if (attacker.soldiers > 0 && target.soldiers > 0) {
      target.soldiers -= 1; // Decrease target's soldier count

      if (target.soldiers <= 0) {
        // Target defeated, attacker gains a soldier
        attacker.soldiers += 1;
        io.to(roomName).emit('playerDefeated', {
          targetId,
          attackerId: socket.id,
          soldiers: attacker.soldiers,
        });
      } else {
        io.to(roomName).emit('playerAttacked', {
          targetId,
          remainingSoldiers: target.soldiers,
        });
      }
    }
  });

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
