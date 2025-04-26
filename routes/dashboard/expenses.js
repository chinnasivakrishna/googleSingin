const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../../middleware/auth');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');

// Get user expenses and balance
router.get('/user', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Fetching user expenses and balance for user: ${req.user._id}`);

  try {
    const userId = req.user._id;

    const expenses = await Expense.find({ paidBy: userId })
      .populate('group', 'name photoUrl')
      .sort({ date: -1 });

    let totalAmount = 0;
    const formattedExpenses = expenses.map((expense) => {
      const amount = expense.amount;
      totalAmount += amount;
      return {
        _id: expense._id,
        description: expense.description,
        amount: amount,
        group: {
          _id: expense.group._id,
          name: expense.group.name,
          photoUrl: expense.group.photoUrl,
        },
        date: expense.date,
        category: expense.category,
        notes: expense.notes,
      };
    });

    res.status(200).json({
      success: true,
      totalAmount: totalAmount,
      expenses: formattedExpenses,
    });
  } catch (error) {
    console.error('Error fetching user expenses and balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user expenses and balance',
      error: error.message,
    });
  }
});

// Get group expenses
router.get('/group/:groupId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get expenses request for group: ${req.params.groupId}`);
  
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
        message: 'You do not have access to view expenses in this group'
      });
    }
    
    const expenses = await Expense.find({ group: groupId })
      .populate('paidBy', 'name email photoUrl')
      .populate('splitAmong.user', 'name email photoUrl')
      .sort({ date: -1 });
    
    res.status(200).json({
      success: true,
      expenses: expenses.map(expense => ({
        _id: expense._id,
        description: expense.description,
        amount: expense.amount,
        paidBy: {
          _id: expense.paidBy._id,
          name: expense.paidBy.name,
          photoUrl: expense.paidBy.photoUrl
        },
        splitAmong: expense.splitAmong.map(split => ({
          user: {
            _id: split.user._id,
            name: split.user.name,
            photoUrl: split.user.photoUrl
          },
          amount: split.amount,
          settled: split.settled
        })),
        date: expense.date,
        category: expense.category,
        notes: expense.notes,
        currentUserPaid: expense.splitAmong.find(split => 
          split.user._id.toString() === userId.toString()
        )?.settled || false,
        isPaidByCurrentUser: expense.paidBy._id.toString() === userId.toString()
      }))
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load expenses',
      error: error.message
    });
  }
});

// Add expense to group
router.post('/group/:groupId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Add expense request for group: ${req.params.groupId}`);

  try {
    const { groupId } = req.params;
    const { description, amount, splitAmong, category, notes, date } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    if (!description || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Description and amount (greater than 0) are required'
      });
    }

    const group = await Group.findById(groupId)
      .populate('admin', 'name email photoUrl')
      .populate('members.user', 'name email photoUrl');

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const isAdmin = group.admin._id.toString() === userId.toString();
    const isMember = group.members.some(
      member => member.user._id.toString() === userId.toString() && member.status === 'active'
    );

    if (!isAdmin && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to add expenses to this group'
      });
    }

    const allMembers = [
      { _id: group.admin._id.toString() },
      ...group.members
        .filter(member => member.status === 'active')
        .map(member => ({ _id: member.user._id.toString() }))
    ];

    let membersToSplit = allMembers;
    if (splitAmong && splitAmong.length > 0) {
      membersToSplit = allMembers.filter(member => 
        splitAmong.includes(member._id.toString())
      );
    }

    if (membersToSplit.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid members to split expense among'
      });
    }

    const splitAmount = parseFloat((amount / membersToSplit.length).toFixed(2));

    const splitDetails = membersToSplit.map(member => ({
      user: member._id,
      amount: splitAmount,
      settled: member._id.toString() === userId.toString()
    }));

    const expense = new Expense({
      group: groupId,
      description,
      amount,
      paidBy: userId,
      splitAmong: splitDetails,
      category: category || 'Other',
      notes,
      date: date || new Date()
    });

    await expense.save();

    await Group.findByIdAndUpdate(groupId, {
      $inc: { totalExpenses: amount },
      updatedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Expense added successfully',
      expense: {
        _id: expense._id,
        description: expense.description,
        amount: expense.amount,
        paidBy: userId,
        date: expense.date,
        splitCount: splitDetails.length,
        splitAmount: splitAmount
      }
    });
  } catch (error) {
    console.error('Add expense error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add expense',
      error: error.message
    });
  }
});

// Mark expense as settled
router.post('/group/:groupId/settle/:expenseId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Mark expense as settled for expense: ${req.params.expenseId}`);
  
  try {
    const { groupId, expenseId } = req.params;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }
    
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    const splitEntry = expense.splitAmong.find(split => 
      split.user.toString() === userId.toString()
    );
    
    if (!splitEntry) {
      return res.status(403).json({
        success: false,
        message: 'You are not involved in this expense'
      });
    }
    
    expense.splitAmong.forEach(split => {
      if (split.user.toString() === userId.toString()) {
        split.settled = true;
      }
    });
    
    await expense.save();
    
    res.status(200).json({
      success: true,
      message: 'Expense marked as settled',
      expenseId
    });
  } catch (error) {
    console.error('Mark expense as settled error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark expense as settled',
      error: error.message
    });
  }
});

// Update expense payment status
router.post('/group/:groupId/payment/:expenseId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Update payment status for expense: ${req.params.expenseId}`);

  try {
    const { groupId, expenseId } = req.params;
    const { userId, amountPaid } = req.body;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.paidBy.toString() !== currentUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update payment status for this expense'
      });
    }

    const splitEntry = expense.splitAmong.find(split => 
      split.user.toString() === userId.toString()
    );

    if (!splitEntry) {
      return res.status(400).json({
        success: false,
        message: 'User is not part of this expense'
      });
    }

    splitEntry.settled = true;
    splitEntry.amountPaid = amountPaid;

    await expense.save();

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      expenseId
    });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update payment status',
      error: error.message
    });
  }
});

module.exports = router; 