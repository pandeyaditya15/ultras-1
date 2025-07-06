const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a specific room
    socket.on('join_room', (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
      
      // Notify others in the room
      socket.to(roomId).emit('user_joined', {
        userId: socket.id,
        timestamp: new Date()
      });
    });

    // Handle chat messages
    socket.on('send_message', (data) => {
      const { roomId, message, userId, username, userAvatar } = data;
      
      const messageData = {
        id: Date.now() + Math.random(),
        roomId,
        userId,
        username,
        userAvatar,
        message,
        timestamp: new Date()
      };

      // Broadcast to all users in the room
      io.to(roomId).emit('new_message', messageData);
      console.log(`Message sent in room ${roomId}:`, messageData);
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      socket.to(data.roomId).emit('user_typing', {
        userId: data.userId,
        username: data.username
      });
    });

    socket.on('typing_stop', (data) => {
      socket.to(data.roomId).emit('user_stopped_typing', {
        userId: data.userId
      });
    });

    // Handle WebRTC signaling for audio streaming
    socket.on('offer', (data) => {
      socket.to(data.roomId).emit('offer', {
        offer: data.offer,
        from: data.from,
        to: data.to
      });
    });

    socket.on('answer', (data) => {
      socket.to(data.roomId).emit('answer', {
        answer: data.answer,
        from: data.from,
        to: data.to
      });
    });

    socket.on('ice-candidate', (data) => {
      socket.to(data.roomId).emit('ice-candidate', {
        candidate: data.candidate,
        from: data.from,
        to: data.to
      });
    });

    // Handle user stage status changes
    socket.on('user_joined_stage', (data) => {
      socket.to(data.roomId).emit('user_joined_stage', {
        userId: data.userId,
        username: data.username,
        userAvatar: data.userAvatar
      });
    });

    socket.on('user_left_stage', (data) => {
      socket.to(data.roomId).emit('user_left_stage', {
        userId: data.userId
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}); 