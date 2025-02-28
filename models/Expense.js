// models/Expense.js - Expense schema for MongoDB
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  splitAmong: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    amount: {
      type: Number,
      default: 0
    },
    settled: {
      type: Boolean,
      default: false
    }
  }],
  date: {
    type: Date,
    default: Date.now
  },
  category: {
    type: String,
    default: 'Other'
  },
  notes: {
    type: String,
    trim: true
  }
});

module.exports = mongoose.model('Expense', expenseSchema);