// routes/dashboard.js - Dashboard routes for group management
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');

// Get all groups for a user
router.get('/groups', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Groups request for user: ${req.user._id}`);
  
  try {
    const userId = req.user._id;
    console.log('Finding groups for user ID:', userId);
    
    // Find groups where user is admin
    const adminGroups = await Group.find({ admin: userId });
    console.log(`Found ${adminGroups.length} groups where user is admin`);
    
    // Find groups where user is a member with 'active' OR 'pending' status
    const memberGroups = await Group.find({
      'members.user': userId,
      'members.status': { $in: ['active', 'pending'] }
    });
    console.log(`Found ${memberGroups.length} groups where user is member`);
    
    // Combine and remove duplicates (in case user is both admin and member)
    const allGroups = [...adminGroups];
    memberGroups.forEach(group => {
      if (!allGroups.find(g => g._id.toString() === group._id.toString())) {
        allGroups.push(group);
      }
    });
    
    console.log(`Total unique groups: ${allGroups.length}`);
    console.log('Sending groups response');
    
    res.status(200).json({
      success: true,
      groups: allGroups.map(group => ({
        _id: group._id,
        name: group.name,
        description: group.description,
        photoUrl: group.photoUrl,
        memberCount: group.memberCount,
        isAdmin: group.admin.toString() === userId.toString(),
        // Add member status so frontend can show pending invitations
        memberStatus: group.admin.toString() === userId.toString() 
          ? 'admin' 
          : group.members.find(m => m.user.toString() === userId.toString())?.status || 'unknown'
      }))
    });
    
    console.log('Groups response sent successfully');
  } catch (error) {
    console.error('Groups fetch error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load groups',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Add this route to your dashboard.js file
router.post('/groups/:groupId/invite', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Invite member request for group: ${req.params.groupId}`);

  try {
    const { groupId } = req.params;
    const { email } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log('Invalid group ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      console.log('Group not found');
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if the user is the admin of the group
    if (group.admin.toString() !== userId.toString()) {
      console.log('User not authorized to invite members');
      return res.status(403).json({
        success: false,
        message: 'Only the group admin can invite members'
      });
    }

    // Find the user by email
    const userToInvite = await User.findOne({ email: email.toLowerCase() });
    if (!userToInvite) {
      console.log('User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if the user is already a member of the group
    const isAlreadyMember = group.members.some(member => member.user.toString() === userToInvite._id.toString());
    if (isAlreadyMember) {
      console.log('User is already a member of the group');
      return res.status(400).json({
        success: false,
        message: 'User is already a member of the group'
      });
    }

    // Add the user to the group's members list with a 'pending' status
    group.members.push({
      user: userToInvite._id,
      status: 'pending',
      role: 'member'
    });

    await group.save();
    console.log(`User ${userToInvite._id} invited to group ${groupId}`);

    res.status(200).json({
      success: true,
      message: 'Invitation sent successfully'
    });

    console.log('Invite member response sent successfully');
  } catch (error) {
    console.error('Invite member error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to send invitation',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Get user expenses and balance
// Get user expenses and balance
router.get('/user/expenses', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Fetching user expenses and balance for user: ${req.user._id}`);

  try {
    const userId = req.user._id;

    // Fetch user's expenses
    const expenses = await Expense.find({ paidBy: userId })
      .populate('group', 'name photoUrl')
      .sort({ date: -1 });

    // Calculate total amount (income - expenses)
    let totalAmount = 0;
    const formattedExpenses = expenses.map((expense) => {
      const amount = expense.amount;
      totalAmount += amount; // Add to total amount
      return {
        _id: expense._id,
        description: expense.description,
        amount: amount, // Positive for income, negative for expenses
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

    console.log(`Found ${expenses.length} expenses for user ${userId}`);

    res.status(200).json({
      success: true,
      totalAmount: totalAmount, // Total amount (income - expenses)
      expenses: formattedExpenses,
    });

    console.log('User expenses and balance response sent successfully');
  } catch (error) {
    console.error('Error fetching user expenses and balance:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user expenses and balance',
      error: error.message,
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Create a new group
router.post('/groups/create', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Create group request from user: ${req.user._id}`);
  console.log('Request body:', {
    name: req.body.name,
    description: req.body.description,
    memberCount: req.body.members ? req.body.members.length : 0
  });
  
  try {
    const { name, description, members } = req.body;
    const userId = req.user._id;
    
    if (!name) {
      console.log('Group name is required');
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }
    
    // Create new group with current user as admin
    const newGroup = new Group({
      name,
      description,
      admin: userId,
      members: [] // Initialize empty members array
    });
    
    // Process invited members if any
    if (members && members.length > 0) {
      console.log(`Processing ${members.length} member invitations`);
      
      // Find users by email
      const invitedMembers = [];
      for (const email of members) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (user && user._id.toString() !== userId.toString()) {
          console.log(`Found user for email ${email}`);
          invitedMembers.push({
            user: user._id,
            status: 'pending',
            role: 'member'
          });
          
          // Update user's groups array
          await User.findByIdAndUpdate(user._id, {
            $addToSet: { groups: newGroup._id }
          });
        } else if (!user) {
          console.log(`No user found for email ${email}`);
        } else {
          console.log(`Skipping self-invite for ${email}`);
        }
      }
      
      newGroup.members = invitedMembers;
    }
    
    // Save the new group
    await newGroup.save();
    console.log(`New group created with ID: ${newGroup._id}`);
    
    // Add group to user's groups array
    await User.findByIdAndUpdate(userId, {
      $addToSet: { groups: newGroup._id }
    });
    console.log(`Group added to user's groups array`);
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: {
        _id: newGroup._id,
        name: newGroup.name,
        description: newGroup.description,
        memberCount: newGroup.memberCount,
        isAdmin: true
      }
    });
    
    console.log('Create group response sent successfully');
  } catch (error) {
    console.error('Group creation error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create group',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Get group details
router.get('/groups/:groupId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Group details request for: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log('Invalid group ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }
    
    // Find the group and populate admin and members
    const group = await Group.findById(groupId)
      .populate('admin', 'name email photoUrl')
      .populate('members.user', 'name email photoUrl');
    
    if (!group) {
      console.log('Group not found');
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Check if user is admin or member
    const isAdmin = group.admin._id.toString() === userId.toString();
    const isMember = group.members.some(
      member => member.user._id.toString() === userId.toString() && member.status === 'active'
    );
    
    if (!isAdmin && !isMember) {
      console.log('User not authorized to view this group');
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this group'
      });
    }
    
    console.log('Group found, sending response');
    res.status(200).json({
      success: true,
      group: {
        _id: group._id,
        name: group.name,
        description: group.description,
        photoUrl: group.photoUrl,
        admin: {
          _id: group.admin._id,
          name: group.admin.name,
          email: group.admin.email,
          photoUrl: group.admin.photoUrl
        },
        members: group.members.map(member => ({
          _id: member.user._id,
          name: member.user.name,
          email: member.user.email,
          photoUrl: member.user.photoUrl,
          status: member.status,
          role: member.role
        })),
        totalExpenses: group.totalExpenses,
        createdAt: group.createdAt,
        memberCount: group.memberCount,
        isAdmin
      }
    });
    
    console.log('Group details response sent successfully');
  } catch (error) {
    console.error('Group details fetch error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load group details',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Add expense to a group
// Add expense to a group
router.post('/groups/:groupId/expenses', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Add expense request for group: ${req.params.groupId}`);

  try {
    const { groupId } = req.params;
    const { description, amount, splitAmong, category, notes, date } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log('Invalid group ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    if (!description || !amount || amount <= 0) {
      console.log('Invalid expense data');
      return res.status(400).json({
        success: false,
        message: 'Description and amount (greater than 0) are required'
      });
    }

    // Find the group
    const group = await Group.findById(groupId)
      .populate('admin', 'name email photoUrl')
      .populate('members.user', 'name email photoUrl');

    if (!group) {
      console.log('Group not found');
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is admin or active member
    const isAdmin = group.admin._id.toString() === userId.toString();
    const isMember = group.members.some(
      member => member.user._id.toString() === userId.toString() && member.status === 'active'
    );

    if (!isAdmin && !isMember) {
      console.log('User not authorized to add expense');
      return res.status(403).json({
        success: false,
        message: 'You do not have access to add expenses to this group'
      });
    }

    // Get group members including admin
    const allMembers = [
      { _id: group.admin._id.toString() },
      ...group.members
        .filter(member => member.status === 'active')
        .map(member => ({ _id: member.user._id.toString() }))
    ];

    // Determine who to split the expense among
    let membersToSplit = allMembers;
    if (splitAmong && splitAmong.length > 0) {
      // Only split among selected members
      membersToSplit = allMembers.filter(member => 
        splitAmong.includes(member._id.toString())
      );
    }

    if (membersToSplit.length === 0) {
      console.log('No valid members to split expense among');
      return res.status(400).json({
        success: false,
        message: 'No valid members to split expense among'
      });
    }

    // Calculate split amount (equal division)
    const splitAmount = parseFloat((amount / membersToSplit.length).toFixed(2));

    // Create split details
    const splitDetails = membersToSplit.map(member => ({
      user: member._id,
      amount: splitAmount,
      settled: member._id.toString() === userId.toString() // Mark paid only for the person who paid
    }));

    // Create expense record
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
    console.log(`Expense created with ID: ${expense._id}`);

    // Update group total expenses
    await Group.findByIdAndUpdate(groupId, {
      $inc: { totalExpenses: amount },
      updatedAt: new Date()
    });

    console.log('Group total expenses updated');
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
        splitAmount: splitAmount // Send the split amount back to the frontend
      }
    });

    console.log('Add expense response sent successfully');
  } catch (error) {
    console.error('Add expense error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add expense',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Update expense payment status
router.post('/groups/:groupId/expenses/:expenseId/update-payment', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Update payment status for expense: ${req.params.expenseId}`);

  try {
    const { groupId, expenseId } = req.params;
    const { userId, amountPaid } = req.body;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(expenseId)) {
      console.log('Invalid ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    // Find the expense
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      console.log('Expense not found');
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check if the current user is the one who paid for the expense
    if (expense.paidBy.toString() !== currentUserId.toString()) {
      console.log('User not authorized to update payment status');
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update payment status for this expense'
      });
    }

    // Find the split entry for the user
    const splitEntry = expense.splitAmong.find(split => 
      split.user.toString() === userId.toString()
    );

    if (!splitEntry) {
      console.log('User is not part of this expense');
      return res.status(400).json({
        success: false,
        message: 'User is not part of this expense'
      });
    }

    // Update the settled status and amount paid
    splitEntry.settled = true;
    splitEntry.amountPaid = amountPaid;

    await expense.save();
    console.log(`Payment status updated for expense ${expenseId} for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      expenseId
    });

    console.log('Update payment status response sent successfully');
  } catch (error) {
    console.error('Update payment status error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update payment status',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Get expenses for a group
router.get('/groups/:groupId/expenses', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get expenses request for group: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log('Invalid group ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }
    
    // Check if user has access to group
    const group = await Group.findById(groupId);
    if (!group) {
      console.log('Group not found');
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
      console.log('User not authorized to view expenses');
      return res.status(403).json({
        success: false,
        message: 'You do not have access to view expenses in this group'
      });
    }
    
    // Fetch expenses
    const expenses = await Expense.find({ group: groupId })
      .populate('paidBy', 'name email photoUrl')
      .populate('splitAmong.user', 'name email photoUrl')
      .sort({ date: -1 });
    
    console.log(`Found ${expenses.length} expenses for group`);
    
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
    
    console.log('Get expenses response sent successfully');
  } catch (error) {
    console.error('Get expenses error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load expenses',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Mark expense as paid/settled
router.post('/groups/:groupId/expenses/:expenseId/settle', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Mark expense as settled for expense: ${req.params.expenseId}`);
  
  try {
    const { groupId, expenseId } = req.params;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(expenseId)) {
      console.log('Invalid ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }
    
    // Find the expense
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      console.log('Expense not found');
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    // Check if user is part of the expense
    const splitEntry = expense.splitAmong.find(split => 
      split.user.toString() === userId.toString()
    );
    
    if (!splitEntry) {
      console.log('User is not part of this expense');
      return res.status(403).json({
        success: false,
        message: 'You are not involved in this expense'
      });
    }
    
    // Update settled status for the user
    expense.splitAmong.forEach(split => {
      if (split.user.toString() === userId.toString()) {
        split.settled = true;
      }
    });
    
    await expense.save();
    console.log(`Expense ${expenseId} marked as settled for user ${userId}`);
    
    res.status(200).json({
      success: true,
      message: 'Expense marked as settled',
      expenseId
    });
    
    console.log('Mark expense as settled response sent successfully');
  } catch (error) {
    console.error('Mark expense as settled error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark expense as settled',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Get balance summary for a group
router.get('/groups/:groupId/balances', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get balances request for group: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    
    // Validate and check access similar to other endpoints
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
    
    // Get all expenses for the group
    const expenses = await Expense.find({ group: groupId })
      .populate('paidBy', 'name email photoUrl')
      .populate('splitAmong.user', 'name email photoUrl');
    
    // Calculate balances
    const balances = {};
    
    // First, add all active group members to balances
    balances[group.admin.toString()] = {
      _id: group.admin.toString(),
      name: (await User.findById(group.admin)).name,
      photoUrl: (await User.findById(group.admin)).photoUrl,
      paid: 0,
      owed: 0,
      net: 0,
      pendingPayments: 0 // Track pending payments
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
          pendingPayments: 0 // Track pending payments
        };
      }
    }
    
    // Process each expense
    for (const expense of expenses) {
      const paidById = expense.paidBy._id.toString();
      
      // Add amount paid
      if (balances[paidById]) {
        balances[paidById].paid += expense.amount;
        balances[paidById].net += expense.amount;
      }
      
      // Subtract amount owed by each person
      for (const split of expense.splitAmong) {
        const userId = split.user._id.toString();
        if (balances[userId]) {
          balances[userId].owed += split.amount;
          balances[userId].net -= split.amount;
          
          // Track pending payments
          if (!split.settled) {
            balances[userId].pendingPayments += split.amount;
          }
        }
      }
    }
    
    // Convert balances object to array
    const balancesArray = Object.values(balances);
    
    res.status(200).json({
      success: true,
      balances: balancesArray
    });
    
    console.log('Get balances response sent successfully');
  } catch (error) {
    console.error('Get balances error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load balances',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

module.exports = router;