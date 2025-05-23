// models/User.js - Updated User schema with password field
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  // Add password field for email authentication
  password: {
    type: String,
    // Not required because Google users won't have a password
  },
  name: {
    type: String,
    required: true
  },
  photoUrl: {
    type: String
  },
  friends: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted'],
      default: 'pending'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  totalBalance: {
    type: Number,
    default: 0
  },
  owedToUser: {
    type: Number,
    default: 0
  },
  userOwes: {
    type: Number,
    default: 0
  },
  bankAccounts: [{
    name: {
      type: String,
      required: true
    },
    accountType: {
      type: String,
      enum: ['checking', 'savings', 'credit'],
      default: 'checking'
    },
    balance: {
      type: Number,
      default: 0
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  defaultCurrency: {
    type: String,
    default: 'USD'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  platform: {
    type: String,
    enum: ['web', 'ios', 'android', 'expo', 'unknown'],
    default: 'unknown'
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);