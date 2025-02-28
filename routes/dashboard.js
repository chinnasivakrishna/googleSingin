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
    
    // Find groups where user is a member with 'active' status
    const memberGroups = await Group.find({
      'members.user': userId,
      'members.status': 'active'
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
        isAdmin: group.admin.toString() === userId.toString()
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
    
    // Calculate split amount
    const splitAmount = amount / membersToSplit.length;
    
    // Create split details
    const splitDetails = membersToSplit.map(member => ({
      user: member._id,
      amount: splitAmount,
      settled: member._id.toString() === userId.toString() // Mark paid for the person who paid
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
        splitCount: splitDetails.length
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
        category: expense.category
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
      net: 0
    };
    
    for (const member of group.members) {
      if (member.status === 'active') {
        balances[member.user.toString()] = {
          _id: member.user.toString(),
          name: (await User.findById(member.user)).name,
          photoUrl: (await User.findById(member.user)).photoUrl,
          paid: 0,
          owed: 0,
          net: 0
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