const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const protect = require('./middleware/auth');
const User = require('./models/User');
const Message = require('./models/Message');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] } 
});

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

// Protect all API routes after /api/auth
app.use('/api', protect);

app.get('/api/users', async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.id } })
    .select('username avatar isOnline lastSeen');
  res.json(users);
});

app.get('/api/friends', async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate('friends', 'username avatar isOnline lastSeen')
    .populate('friendRequests', 'username avatar isOnline lastSeen');

  const allUsers = await User.find({ _id: { $ne: req.user.id } })
    .select('username avatar isOnline lastSeen');

  const sentRequests = await User.find({ friendRequests: req.user.id })
    .select('username avatar isOnline lastSeen');

  res.json({
    friends: user.friends,
    requests: user.friendRequests,
    sentRequests,
    allUsers
  });
});

app.post('/api/friends/request', async (req, res) => {
  const { receiverId } = req.body;
  if (!receiverId) return res.status(400).json({ message: 'receiverId is required' });
  if (receiverId === req.user.id) return res.status(400).json({ message: 'Cannot friend yourself' });

  const receiver = await User.findById(receiverId);
  if (!receiver) return res.status(404).json({ message: 'User not found' });

  const alreadyFriend = receiver.friends.includes(req.user.id);
  const alreadyRequested = receiver.friendRequests.includes(req.user.id);
  if (alreadyFriend) return res.status(400).json({ message: 'Already friends' });
  if (alreadyRequested) return res.status(400).json({ message: 'Request already sent' });

  receiver.friendRequests.push(req.user.id);
  await receiver.save();

  res.json({ message: 'Friend request sent' });
});

app.post('/api/friends/respond', async (req, res) => {
  const { requesterId, accept } = req.body;
  if (!requesterId) return res.status(400).json({ message: 'requesterId is required' });

  const me = await User.findById(req.user.id);
  const requester = await User.findById(requesterId);
  if (!requester) return res.status(404).json({ message: 'User not found' });

  // remove request
  me.friendRequests = me.friendRequests.filter(id => id.toString() !== requesterId);

  if (accept) {
    if (!me.friends.includes(requesterId)) me.friends.push(requesterId);
    if (!requester.friends.includes(req.user.id)) requester.friends.push(req.user.id);
    await requester.save();
  }

  await me.save();
  res.json({ message: accept ? 'Friend added' : 'Request declined' });
});

app.get('/api/messages/:receiverId', async (req, res) => {
  const messages = await Message.find({
    $or: [
      { sender: req.user.id, receiver: req.params.receiverId },
      { sender: req.params.receiverId, receiver: req.user.id }
    ]
  }).sort({ createdAt: 1 });
  res.json(messages);
});

app.post('/api/messages/read', async (req, res) => {
  const { senderId } = req.body;
  if (!senderId) return res.status(400).json({ message: 'senderId is required' });

  const result = await Message.updateMany(
    { sender: senderId, receiver: req.user.id, isRead: false },
    { $set: { isRead: true } }
  );

  // Notify sender (if online) that messages were read.
  const senderSocketId = userSocketMap[senderId];
  if (senderSocketId) {
    io.to(senderSocketId).emit('messagesRead', { readerId: req.user.id, senderId });
  }

  res.json({ updated: result.modifiedCount });
});
// =================================

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Socket.io logic (giữ nguyên như trước)
const userSocketMap = {};

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.user.id;
  userSocketMap[userId] = socket.id;

  await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: Date.now() });
  io.emit('onlineUsers', Object.keys(userSocketMap));

  socket.on('joinChat', async ({ receiverId }) => {
    const room = [userId, receiverId].sort().join('_');
    socket.join(room);

    // Mark any unread messages from this chat as read
    const result = await Message.updateMany(
      { sender: receiverId, receiver: userId, isRead: false },
      { $set: { isRead: true } }
    );

    if (result.modifiedCount > 0) {
      const receiverSocketId = userSocketMap[receiverId];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('messagesRead', { readerId: userId, senderId: receiverId });
      }
    }
  });

  socket.on('sendMessage', async ({ receiverId, content }, callback) => {
    const room = [userId, receiverId].sort().join('_');
    const message = await new Message({ sender: userId, receiver: receiverId, content }).save();
    io.to(room).emit('receiveMessage', message);
    if (callback) callback(message);
  });

  socket.on('typing', ({ receiverId }) => {
    const room = [userId, receiverId].sort().join('_');
    socket.to(room).emit('userTyping', { senderId: userId });
  });

  socket.on('stopTyping', ({ receiverId }) => {
    const room = [userId, receiverId].sort().join('_');
    socket.to(room).emit('userStopTyping', { senderId: userId });
  });

  socket.on('disconnect', async () => {
    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: Date.now() });
    delete userSocketMap[userId];
    io.emit('onlineUsers', Object.keys(userSocketMap));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));