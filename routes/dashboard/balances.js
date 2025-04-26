const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../../middleware/auth');
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');

// Get balance summary for a group
router.get('/group/:groupId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get balances request for group: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    const isAdmin = group.admin.toString() === userId.toString();
    const isMember = group.members.some(
      member => member.user.toString() === userId.toString() && member.status === 'active'
    );
    
    if (!isAdmin && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to view balances in this group'
      });
    }
    
    const expenses = await Expense.find({ group: groupId })
      .populate('paidBy', 'name email photoUrl')
      .populate('splitAmong.user', 'name email photoUrl');
    
    const balances = {};
    
    // Initialize balances for admin and active members
    balances[group.admin.toString()] = {
      _id: group.admin.toString(),
      name: (await User.findById(group.admin)).name,
      photoUrl: (await User.findById(group.admin)).photoUrl,
      paid: 0,
      owed: 0,
      net: 0,
      pendingPayments: 0
    };
    
    for (const member of group.members) {
      if (member.status === 'active') {
        balances[member.user.toString()] = {
          _id: member.user.toString(),
          name: (await User.findById(member.user)).name,
          photoUrl: (await User.findById(member.user)).photoUrl,
          paid: 0,
          owed: 0,
          net: 0,
          pendingPayments: 0
        };
      }
    }
    
    // Calculate balances from expenses
    for (const expense of expenses) {
      const paidById = expense.paidBy._id.toString();
      
      if (balances[paidById]) {
        balances[paidById].paid += expense.amount;
        balances[paidById].net += expense.amount;
      }
      
      for (const split of expense.splitAmong) {
        const userId = split.user._id.toString();
        if (balances[userId]) {
          balances[userId].owed += split.amount;
          balances[userId].net -= split.amount;
          
          if (!split.settled) {
            balances[userId].pendingPayments += split.amount;
          }
        }
      }
    }
    
    const balancesArray = Object.values(balances);
    
    res.status(200).json({
      success: true,
      balances: balancesArray
    });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load balances',
      error: error.message
    });
  }
});

module.exports = router; 