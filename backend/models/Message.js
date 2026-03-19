const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // For 1:1 chats
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // For group room chats
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  content: { type: String, default: '' },
  // Client-generated temporary ID to avoid duplicate messages on the sender side
  clientId: { type: String },
  attachment: {
    url: String,
    name: String,
    type: String,
    size: Number
  },
  isRead: { type: Boolean, default: false },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Reactions: array of {user: ObjectId, emoji: String}
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, required: true }
  }],
  // Edit/Delete functionality
  editedAt: { type: Date },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Message threads/replies
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  // GIF/Sticker support
  gif: {
    url: String,
    title: String
  },
  sticker: {
    url: String,
    name: String
  },
  // Bot messages
  isBot: { type: Boolean, default: false },
  botType: { type: String } // 'ai', 'system', etc.
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);