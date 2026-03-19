const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const authRoutes = require('./routes/auth');
const protect = require('./middleware/auth');
const User = require('./models/User');
const Message = require('./models/Message');
const Room = require('./models/Room');

dotenv.config();

const app = express();

// Xóa nhóm (room)
app.delete('/api/rooms/:roomId', protect, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Chỉ owner hoặc admin mới được xóa nhóm
    if (room.createdBy.toString() !== req.user.id && !room.admins.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to delete this room' });
    }

    await Room.findByIdAndDelete(req.params.roomId);
    // Xóa luôn các message liên quan đến room này (nếu cần)
    await Message.deleteMany({ room: req.params.roomId });

    res.json({ message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete room' });
  }
});
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(server, { 
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true } 
});

// Local file uploads (attachments)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({ storage });

app.use('/uploads', express.static(uploadDir));

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use('/api/auth', authRoutes);

// Protect all API routes after /api/auth
app.use('/api', protect);

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url, name: req.file.originalname, type: req.file.mimetype, size: req.file.size });
});

// Room (group chat) endpoints
app.post('/api/rooms', async (req, res) => {
  const { name, memberIds = [] } = req.body;
  if (!name || !memberIds.length) return res.status(400).json({ message: 'name and memberIds are required' });

  const members = Array.from(new Set([req.user.id, ...memberIds]));
  const room = await Room.create({ name, members, createdBy: req.user.id });
  const populated = await Room.findById(room._id).populate('members', 'username avatar');
  res.json(populated);
});

app.get('/api/rooms', async (req, res) => {
  const rooms = await Room.find({ members: req.user.id }).populate('members', 'username avatar');
  res.json(rooms);
});

app.get('/api/rooms/:roomId/messages', async (req, res) => {
  const messages = await Message.find({ room: req.params.roomId })
    .populate('replyTo')
    .populate('reactions.user', 'username')
    .sort({ createdAt: 1 });
  res.json(messages);
});

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
  })
  .populate('replyTo')
  .populate('reactions.user', 'username')
  .sort({ createdAt: 1 });
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

// Message reactions
app.post('/api/messages/:messageId/react', async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ message: 'emoji is required' });

  const message = await Message.findById(req.params.messageId);
  if (!message) return res.status(404).json({ message: 'Message not found' });

  // Check if user already reacted
  const existingReaction = message.reactions.find(r => r.user.toString() === req.user.id);
  if (existingReaction) {
    if (existingReaction.emoji === emoji) {
      // Remove reaction
      message.reactions = message.reactions.filter(r => r.user.toString() !== req.user.id);
    } else {
      // Update reaction
      existingReaction.emoji = emoji;
    }
  } else {
    // Add new reaction
    message.reactions.push({ user: req.user.id, emoji });
  }

  await message.save();
  const populated = await Message.findById(message._id).populate('reactions.user', 'username');
  res.json(populated);
});

// Edit message
app.put('/api/messages/:messageId', async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ message: 'content is required' });

  const message = await Message.findById(req.params.messageId);
  if (!message) return res.status(404).json({ message: 'Message not found' });

  if (message.sender.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Can only edit your own messages' });
  }

  // Only allow editing within 5 minutes
  if (Date.now() - message.createdAt > 5 * 60 * 1000) {
    return res.status(400).json({ message: 'Can only edit messages within 5 minutes' });
  }

  message.content = content.trim();
  message.editedAt = new Date();
  await message.save();

  res.json(message);
});

// Delete message
app.delete('/api/messages/:messageId', async (req, res) => {
  const message = await Message.findById(req.params.messageId);
  if (!message) return res.status(404).json({ message: 'Message not found' });

  const isRoom = !!message.room;
  const canDelete = message.sender.toString() === req.user.id ||
    (isRoom && await Room.findOne({ _id: message.room, admins: req.user.id }));

  if (!canDelete) {
    return res.status(403).json({ message: 'Cannot delete this message' });
  }

  message.deletedAt = new Date();
  message.deletedBy = req.user.id;
  message.content = 'This message was deleted';
  await message.save();

  res.json({ message: 'Message deleted' });
});

// Room management
app.post('/api/rooms/:roomId/members', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId is required' });

  const room = await Room.findById(req.params.roomId);
  if (!room) return res.status(404).json({ message: 'Room not found' });

  if (!room.admins.includes(req.user.id) && room.createdBy.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  if (room.members.includes(userId)) {
    return res.status(400).json({ message: 'User already in room' });
  }

  room.members.push(userId);
  await room.save();

  const populated = await Room.findById(room._id).populate('members', 'username avatar');
  res.json(populated);
});

app.delete('/api/rooms/:roomId/members/:userId', async (req, res) => {
  const room = await Room.findById(req.params.roomId);
  if (!room) return res.status(404).json({ message: 'Room not found' });

  const canRemove = room.admins.includes(req.user.id) ||
    room.createdBy.toString() === req.user.id ||
    req.params.userId === req.user.id;

  if (!canRemove) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  room.members = room.members.filter(id => id.toString() !== req.params.userId);
  await room.save();

  const populated = await Room.findById(room._id).populate('members', 'username avatar');
  res.json(populated);
});

// User preferences
app.put('/api/user/preferences', async (req, res) => {
  const { theme, status } = req.body;
  const allowedThemes = ['light', 'dark', 'auto'];
  const allowedStatuses = ['online', 'away', 'busy', 'invisible'];

  const update = {};
  if (theme && allowedThemes.includes(theme)) update.theme = theme;
  if (status && allowedStatuses.includes(status)) update.status = status;

  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
  res.json({ theme: user.theme, status: user.status });
});

// Push notification subscription
const pushSubscriptions = new Map(); // userId -> subscription

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ message: 'subscription is required' });

  pushSubscriptions.set(req.user.id, subscription);
  res.json({ message: 'Subscribed to push notifications' });
});

app.post('/api/push/unsubscribe', async (req, res) => {
  pushSubscriptions.delete(req.user.id);
  res.json({ message: 'Unsubscribed from push notifications' });
});

// Function to send push notifications
async function sendPushNotification(subscription, payload) {
  const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };

  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:your-email@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );

    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// Delete entire chat conversation
app.delete('/api/chats/:userId', async (req, res) => {
  const { userId } = req.params;

  // Delete all messages between current user and target user
  await Message.deleteMany({
    $or: [
      { sender: req.user.id, receiver: userId },
      { sender: userId, receiver: req.user.id }
    ]
  });

  res.json({ message: 'Chat deleted' });
});

// Unfriend user
app.delete('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;

  const me = await User.findById(req.user.id);
  const friend = await User.findById(userId);

  if (!friend) return res.status(404).json({ message: 'User not found' });

  // Remove from both users' friend lists
  me.friends = me.friends.filter(id => id.toString() !== userId);
  friend.friends = friend.friends.filter(id => id.toString() !== req.user.id);

  await me.save();
  await friend.save();

  res.json({ message: 'Unfriended successfully' });
});

// GIF search (using GIPHY API)
app.get('/api/gifs/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ message: 'Query parameter required' });

  try {
    const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC'; // Public beta key
    const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=g`);
    const data = await response.json();

    const gifs = data.data.map(gif => ({
      id: gif.id,
      url: gif.images.fixed_height.url,
      title: gif.title,
      width: gif.images.fixed_height.width,
      height: gif.images.fixed_height.height
    }));

    res.json(gifs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch GIFs' });
  }
});

// Send reply message
app.post('/api/messages/reply/:messageId', async (req, res) => {
  const { content, receiverId, roomId } = req.body;
  const replyTo = req.params.messageId;

  const message = await Message.findById(replyTo);
  if (!message) return res.status(404).json({ message: 'Message to reply to not found' });

  const newMessage = await new Message({
    sender: req.user.id,
    receiver: receiverId,
    room: roomId,
    content,
    replyTo
  }).save();

  const populated = await Message.findById(newMessage._id)
    .populate('sender', 'username avatar')
    .populate('replyTo')
    .populate('reactions.user', 'username');

  res.json(populated);
});

// Bot message (AI response)
app.post('/api/bot/message', async (req, res) => {
  const { message, conversationId, type } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ message: 'message is required' });
  }

  const cleanedMessage = message.trim();

  let contextMessages = [];
  try {
    const query = type === 'room'
      ? { room: conversationId }
      : {
          $or: [
            { sender: req.user.id, receiver: conversationId },
            { sender: conversationId, receiver: req.user.id }
          ]
        };

    contextMessages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
  } catch {
    contextMessages = [];
  }

  const buildBotReply = (userText, context) => {
    const text = userText.toLowerCase();
    const recent = context
      .filter(m => m.content)
      .map(m => m.content.trim())
      .filter(Boolean)
      .slice(0, 3)
      .reverse();

    if (/^(hi|hello|hey|xin chao|chao)/.test(text)) {
      return 'Xin chao, minh la tro ly AI trong chat. Ban can minh ho tro viec gi ngay bay gio?';
    }

    if (text.includes('help') || text.includes('ho tro')) {
      return 'Minh co the giup tom tat tin nhan, goi y cau tra loi, va dua ra huong xu ly theo ngu canh doan chat hien tai.';
    }

    if (text.includes('tom tat') || text.includes('summary')) {
      if (!recent.length) {
        return 'Chua co du du lieu de tom tat. Ban hay nhan them vai tin trong cuoc tro chuyen.';
      }
      return `Tom tat nhanh: ${recent.join(' | ')}`;
    }

    if (text.endsWith('?')) {
      return `Theo ngu canh hien tai, cau hoi cua ban la: "${userText}". Goi y: tach van de thanh 2-3 buoc nho, uu tien buoc co the kiem chung ngay.`;
    }

    if (recent.length) {
      return `Minh da doc ngu canh gan day (${recent.length} tin). Goi y tiep theo: xac nhan muc tieu, thong nhat deadline, va chot nguoi phu trach.`;
    }

    return 'Minh da nhan duoc tin cua ban. Ban co the cho minh biet muc tieu cu the hon de minh ho tro chinh xac?';
  };

  const botReply = buildBotReply(cleanedMessage, contextMessages);

  const botMessageData = {
    sender: req.user.id, // treat bot messages as from the current user so they show in the current chat
    receiver: null,
    room: null,
    content: botReply,
    isBot: true,
    botType: 'ai'
  };

  if (type === 'room') {
    botMessageData.room = conversationId;
  } else {
    botMessageData.receiver = conversationId;
  }

  const botMessage = await new Message(botMessageData).save();

  res.json(botMessage);
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

  socket.on('joinRoom', async ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);

    // Mark messages in this room as read by this user
    await Message.updateMany(
      { room: roomId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    io.to(roomId).emit('roomRead', { roomId, readerId: userId });
  });

  // WebRTC signaling for 1:1 audio calls
  socket.on('call:start', ({ toUserId, offer, fromUsername }, callback) => {
    if (!toUserId || !offer) {
      if (callback) callback({ error: 'Invalid call payload' });
      return;
    }

    const targetSocketId = userSocketMap[toUserId];
    if (!targetSocketId) {
      if (callback) callback({ error: 'User is offline' });
      return;
    }

    io.to(targetSocketId).emit('call:incoming', {
      fromUserId: userId,
      fromUsername: fromUsername || socket.user?.username || 'Unknown',
      offer
    });

    if (callback) callback({ ok: true });
  });

  socket.on('call:answer', ({ toUserId, answer }) => {
    if (!toUserId || !answer) return;
    const targetSocketId = userSocketMap[toUserId];
    if (!targetSocketId) return;

    io.to(targetSocketId).emit('call:answer', {
      fromUserId: userId,
      answer
    });
  });

  socket.on('call:ice-candidate', ({ toUserId, candidate }) => {
    if (!toUserId || !candidate) return;
    const targetSocketId = userSocketMap[toUserId];
    if (!targetSocketId) return;

    io.to(targetSocketId).emit('call:ice-candidate', {
      fromUserId: userId,
      candidate
    });
  });

  socket.on('call:reject', ({ toUserId, reason }) => {
    if (!toUserId) return;
    const targetSocketId = userSocketMap[toUserId];
    if (!targetSocketId) return;

    io.to(targetSocketId).emit('call:reject', {
      fromUserId: userId,
      reason: reason || 'Call rejected'
    });
  });

  socket.on('call:end', ({ toUserId }) => {
    if (!toUserId) return;
    const targetSocketId = userSocketMap[toUserId];
    if (!targetSocketId) return;

    io.to(targetSocketId).emit('call:end', { fromUserId: userId });
  });

socket.on('sendMessage', async ({ receiverId, roomId, content = '', attachment, replyTo, gif, sticker, clientId }, callback) => {
    try {
      let message;
      let populatedMessage;

      if (roomId) {
        message = await new Message({ sender: userId, room: roomId, content, attachment, replyTo, gif, sticker, clientId }).save();
        populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username avatar')
          .populate('replyTo')
          .populate('reactions.user', 'username');
        io.to(roomId).emit('receiveRoomMessage', populatedMessage);

        // Send push notifications to offline room members
        const room = await Room.findById(roomId).populate('members', 'username');
        const sender = await User.findById(userId);
        for (const member of room.members) {
          if (member._id.toString() !== userId && !userSocketMap[member._id.toString()]) {
            const subscription = pushSubscriptions.get(member._id.toString());
            if (subscription) {
              sendPushNotification(subscription, {
                title: `${sender.username} in ${room.name}`,
                body: content || 'Sent an attachment',
                url: `/room/${roomId}`
              });
            }
          }
        }
      } else {
        const room = [userId, receiverId].sort().join('_');
        message = await new Message({ sender: userId, receiver: receiverId, content, attachment, replyTo, gif, sticker, clientId }).save();
        populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username avatar')
          .populate('replyTo')
          .populate('reactions.user', 'username');
        io.to(room).emit('receiveMessage', populatedMessage);

        // Send push notification to offline receiver
        if (!userSocketMap[receiverId]) {
          const subscription = pushSubscriptions.get(receiverId);
          if (subscription) {
            const sender = await User.findById(userId);
            sendPushNotification(subscription, {
              title: sender.username,
              body: content || 'Sent an attachment',
              url: `/chat/${userId}`
            });
          }
        }
      }

      if (callback) callback(populatedMessage);
    } catch (err) {
      console.error('sendMessage error:', err);
      if (callback) callback({ error: 'Failed to send message' });
    }
  });

  socket.on('typing', ({ receiverId }) => {
    const room = [userId, receiverId].sort().join('_');
    socket.to(room).emit('userTyping', { senderId: userId });
  });

  socket.on('stopTyping', ({ receiverId }) => {
    const room = [userId, receiverId].sort().join('_');
    socket.to(room).emit('userStopTyping', { senderId: userId });
  });

  socket.on('roomTyping', ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit('roomTyping', { senderId: userId, roomId });
  });

  socket.on('roomStopTyping', ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit('roomStopTyping', { senderId: userId, roomId });
  });

  socket.on('disconnect', async () => {
    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: Date.now() });
    delete userSocketMap[userId];
    io.emit('onlineUsers', Object.keys(userSocketMap));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));