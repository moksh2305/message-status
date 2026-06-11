const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // Increase limit to ~100MB for image uploads
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'broadcast-tracker.html'));
});

// Load data
let broadcasts = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    broadcasts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    // Initial data if empty
    broadcasts = [{
      id: Date.now(),
      title: "Community meeting — 15 June",
      msg: "Dear all, please note the community meeting is scheduled for Sunday, 15 June at 10 AM. Kindly inform your respective group members and confirm attendance.",
      time: new Date().toLocaleString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
        day: '2-digit', month: 'short'
      }),
      status: {}
    }];
    fs.writeFileSync(DATA_FILE, JSON.stringify(broadcasts, null, 2));
  }
} catch (err) {
  console.error("Error loading data:", err);
}

let isWriting = false;
let pendingWrite = false;

function saveData() {
  if (isWriting) {
    pendingWrite = true;
    return;
  }
  isWriting = true;
  fs.writeFile(DATA_FILE, JSON.stringify(broadcasts, null, 2), (err) => {
    isWriting = false;
    if (err) console.error("Error saving data:", err);
    if (pendingWrite) {
      pendingWrite = false;
      saveData();
    }
  });
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Send current state to the newly connected user
  socket.emit('init_data', broadcasts);

  // Listen for new broadcast
  socket.on('new_broadcast', (b) => {
    broadcasts.unshift(b);
    saveData();
    io.emit('state_update', broadcasts);
  });

  // Listen for confirm sent
  socket.on('confirm_sent', ({ id, missionIdx, status }) => {
    const b = broadcasts.find(x => x.id === id);
    if (b) {
      b.status[missionIdx] = status;
      saveData();
      io.emit('state_update', broadcasts);
    }
  });

  // Listen for delete broadcast
  socket.on('delete_broadcast', (id) => {
    broadcasts = broadcasts.filter(x => x.id !== id);
    saveData();
    io.emit('state_update', broadcasts);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
});
