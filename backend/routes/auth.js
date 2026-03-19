const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUsername = username?.trim();
  try {
    if (!normalizedEmail || !normalizedUsername || !password) {
      return res.status(400).json({ message: 'Thiếu thông tin đăng ký' });
    }

    if (await User.findOne({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] })) {
      return res.status(400).json({ message: 'User đã tồn tại' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await new User({ username: normalizedUsername, email: normalizedEmail, password: hashed }).save();

    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Thiếu email hoặc mật khẩu' });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ message: 'Email hoặc mật khẩu sai' });
  }
  const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar } });
});

module.exports = router;