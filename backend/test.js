const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

console.log('Attempting to connect to MongoDB...');
console.log('MONGO_URI:', process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  });