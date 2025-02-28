// routes/expenses.js - Expense management routes
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const mongoose = require('mongoose');

// Create a new expense
router.post('/', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Create expense request from user: ${req.user._id}`);
  
  try {
    // Create a session for transactions
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const {
        title,
        amount,
        groupId,
        splitType = 'equal',
        splitDetails = [],
        category = 'Other',
        description = '',
        date = new Date()
      } = req.body;
      
      console.log(`Creating expense: ${title} for $${amount}`);
      
      // Validate group if groupId is provided
      if (groupId) {
        const group = await Group.findOne({
          _id: groupId,
          'members.user': req.user._id
        }).session(session);
        
        if (!group) {
          console.log('Group not found or user not a member');
          return res.status(404).json({
            success: false,
            message: 'Group not found or you are not a member'
          });
        }
      }
      
      // Prepare split between array
      let splitBetween = [];
      
      if (groupId && splitType === 'equal') {
        // Get group members for equal split
        const group = await Group.findById(groupId).session(session);
        const memberCount = group.members.length;
        const splitAmount = amount / memberCount;
        
        splitBetween = group.members.map(member => {
          const userId = member.user.toString();
          return {
            user: userId,
            amount: splitAmount,
            status: userId === req.user._id.toString() ? 'paid' : 'pending'
          };
        });
      } else if (splitDetails.length > 0) {
        // Custom split as provided
        splitBetween = splitDetails.map(detail => ({
          user: detail.userId,
          amount: detail.amount,
          status: detail.userId === req.user._id.toString() ? 'paid' : 'pending'
        }));
      } else {
        // Simple expense paid by current user
        splitBetween = [{
          user: req.user._id,
          amount: amount,
          status: 'paid'
        }];
      }
      
      // Create expense
      const expense = new Expense({
        title,
        amount,
        paidBy: req.user._id,
        group: groupId || null,
        splitBetween,
        category,
        description,
        date
      });
      
      await expense.save({ session });
      console.log('Expense created:', expense._id);
      
      // Update group balances if this is a group expense
      if (groupId) {
        // Get current balances
        const group = await Group.findById(groupId).session(session);
        
        // Update total expenses
        group.totalExpenses = (group.totalExpenses || 0) + amount;
        
        // Get existing balances as a map
        const balanceMap = {};
        group.balances.forEach(b => {
          balanceMap[b.user.toString()] = b.amount;
        });
        
        // Calculate new balances
        splitBetween.forEach(split => {
          const userId = split.user.toString();
          const currentBalance = balanceMap[userId] || 0;
          
          // If user paid, add the total amount
          if (userId === req.user._id.toString()) {
            balanceMap[userId] = currentBalance + amount;
          }
          
          // Subtract their share (what they owe)
          balanceMap[userId] = (balanceMap[userId] || 0) - split.amount;
        });
        
        // Update group balances
        group.balances = Object.keys(balanceMap).map(userId => ({
          user: userId,
          amount: balanceMap[userId]
        }));
        
        await group.save({ session });
        console.log('Group balances updated');
        
        // Calculate simplified debts
        // Note: Simplified debt calculation happens outside the transaction
        // because it's a complex operation and not critical to data consistency
      }
      
      // Update user balances
      for (const split of splitBetween) {
        const userId = split.user.toString();
        if (userId === req.user._id.toString()) continue; // Skip current user
        
        const user = await User.findById(userId).session(session);
        if (!user) continue;
        
        // Update what user owes
        if (split.status === 'pending') {
          user.userOwes = (user.userOwes || 0) + split.amount;
          user.totalBalance = (user.owedToUser || 0) - user.userOwes;
          await user.save({ session });
          console.log(`Updated what user ${userId} owes`);
        }
      }
      
      // Update current user's balance
      const currentUser = await User.findById(req.user._id).session(session);
      let owedAmount = 0;
      
      // Calculate how much others owe the current user
      splitBetween.forEach(split => {
        if (split.user.toString() !== req.user._id.toString() && split.status === 'pending') {
          owedAmount += split.amount;
        }
      });
      
      currentUser.owedToUser = (currentUser.owedToUser || 0) + owedAmount;
      currentUser.totalBalance = currentUser.owedToUser - (currentUser.userOwes || 0);
      await currentUser.save({ session });
      console.log('Current user balance updated');
      
      // Commit transaction
      await session.commitTransaction();
      session.endSession();
      
      res.status(201).json({
        success: true,
        message: 'Expense created successfully',
        expense: {
          id: expense._id,
          title: expense.title,
          amount: expense.amount,
          date: expense.date
        }
      });
      console.log('Expense creation response sent');
      
      // Asynchronously update simplified debts (after response is sent)
      if (groupId) {
        updateSimplifiedDebts(groupId)
          .then(success => {
            if (success) {
              console.log('Simplified debts updated for group:', groupId);
            }
          })
          .catch(error => {
            console.error('Error updating simplified debts:', error);
          });
      }
    } catch (txError) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw txError;
    }
  } catch (error) {
    console.error('Expense creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Get user expenses
router.get('/', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get expenses request from user: ${req.user._id}`);
  
  try {
    const { groupId, limit = 10, offset = 0 } = req.query;
    
    // Build query
    const query = {
      $or: [
        { paidBy: req.user._id },
        { 'splitBetween.user': req.user._id }
      ]
    };
    
    // Add group filter if provided
    if (groupId) {
      query.group = groupId;
      
      // Verify user is a member of the group
      const isMember = await Group.exists({
        _id: groupId,
        'members.user': req.user._id
      });
      
      if (!isMember) {
        console.log('User not a member of the group');
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this group'
        });
      }
    }
    
    console.log('Fetching expenses with query:', JSON.stringify(query));
    
    // Get total count
    const total = await Expense.countDocuments(query);
    
    // Get expenses
    const expenses = await Expense.find(query)
      .sort({ date: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('paidBy', 'name photoUrl')
      .populate('group', 'name')
      .populate('splitBetween.user', 'name photoUrl');
    
    console.log(`Found ${expenses.length} expenses`);
    
    // Format expenses for response
    const formattedExpenses = expenses.map(expense => {
      const userSplit = expense.splitBetween.find(
        s => s.user._id.toString() === req.user._id.toString()
      );
      
      return {
        id: expense._id,
        title: expense.title,
        amount: expense.amount,
        date: expense.date,
        category: expense.category,
        paidBy: {
          id: expense.paidBy._id,
          name: expense.paidBy.name,
          photoUrl: expense.paidBy.photoUrl
        },
        group: expense.group ? {
          id: expense.group._id,
          name: expense.group.name
        } : null,
        userPaid: expense.paidBy._id.toString() === req.user._id.toString(),
        userOwes: userSplit ? userSplit.amount : 0,
        userPaidStatus: userSplit ? userSplit.status : 'N/A'
      };
    });
    
    res.status(200).json({
      success: true,
      expenses: formattedExpenses,
      total,
      hasMore: total > parseInt(offset) + expenses.length
    });
    console.log('Expenses response sent');
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Get expense details by ID
router.get('/:expenseId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get expense details request for: ${req.params.expenseId}`);
  
  try {
    const { expenseId } = req.params;
    
    // Find expense and verify user's access
    const expense = await Expense.findOne({
      _id: expenseId,
      $or: [
        { paidBy: req.user._id },
        { 'splitBetween.user': req.user._id }
      ]
    })
    .populate('paidBy', 'name email photoUrl')
    .populate('group', 'name description')
    .populate('splitBetween.user', 'name email photoUrl');
    
    if (!expense) {
      console.log('Expense not found or not accessible');
      return res.status(404).json({
        success: false,
        message: 'Expense not found or you do not have access'
      });
    }
    
    console.log('Expense found:', expense.title);
    
    res.status(200).json({
      success: true,
      expense
    });
    console.log('Expense details response sent');
  } catch (error) {
    console.error('Get expense details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense details',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Mark expense as paid
router.post('/:expenseId/pay', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console