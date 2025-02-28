// routes/groups.js - Group management routes with expense splitting
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const mongoose = require('mongoose');

// Create a new group
router.post('/', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Create group request from user: ${req.user._id}`);
  
  try {
    const { name, description, members = [], isPublic = true, tags = [] } = req.body;
    console.log('Creating new group:', name);
    
    // Create group
    const group = new Group({
      name,
      description,
      createdBy: req.user._id,
      isPublic,
      tags,
      members: [{ user: req.user._id, role: 'admin' }],
      memberCount: 1 + members.length
    });
    
    // Add members if provided
    if (members.length > 0) {
      console.log(`Adding ${members.length} members to the group`);
      for (const memberId of members) {
        // Skip if member is the creator
        if (memberId === req.user._id.toString()) continue;
        
        group.members.push({ user: memberId, role: 'member' });
        
        // Update user's groups
        await User.findByIdAndUpdate(memberId, {
          $addToSet: { groups: group._id }
        });
      }
    }
    
    // Save group
    await group.save();
    console.log('Group created successfully:', group._id);
    
    // Add group to creator's groups
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { groups: group._id }
    });
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: {
        id: group._id,
        name: group.name,
        description: group.description,
        memberCount: group.memberCount
      }
    });
    console.log('Group creation response sent');
  } catch (error) {
    console.error('Group creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create group',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Get all user's groups
router.get('/', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get groups request from user: ${req.user._id}`);
  
  try {
    // Find all groups where user is a member
    const groups = await Group.find({
      'members.user': req.user._id
    }).select('name description photoUrl memberCount totalExpenses updatedAt');
    
    console.log(`Found ${groups.length} groups for user`);
    
    res.status(200).json({
      success: true,
      groups
    });
    console.log('Groups list response sent');
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch groups',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Get group details by ID
router.get('/:groupId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Get group details request for: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    
    // Check if user is a member of the group
    const group = await Group.findOne({
      _id: groupId,
      'members.user': req.user._id
    }).populate({
      path: 'members.user',
      select: 'name email photoUrl'
    });
    
    if (!group) {
      console.log('Group not found or user not a member');
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    console.log('Group found:', group.name);
    
    // Get recent expenses for the group
    const recentExpenses = await Expense.find({ group: groupId })
      .sort({ date: -1 })
      .limit(5)
      .populate('paidBy', 'name photoUrl')
      .select('title amount date paidBy category');
    
    console.log(`Found ${recentExpenses.length} recent expenses`);
    
    // Get simplified debts for the group
    const simplifiedDebts = await Group.findById(groupId)
      .select('simplifiedDebts')
      .populate({
        path: 'simplifiedDebts.from simplifiedDebts.to',
        select: 'name photoUrl'
      });
    
    res.status(200).json({
      success: true,
      group,
      recentExpenses,
      simplifiedDebts: simplifiedDebts.simplifiedDebts
    });
    console.log('Group details response sent');
  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch group details',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Add members to group
router.post('/:groupId/members', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Add members request for group: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    const { emails = [] } = req.body;
    
    // Check if user is an admin of the group
    const group = await Group.findOne({
      _id: groupId,
      'members.user': req.user._id,
      'members.role': 'admin'
    });
    
    if (!group) {
      console.log('Group not found or user not an admin');
      return res.status(403).json({
        success: false,
        message: 'Not authorized or group not found'
      });
    }
    
    console.log(`Adding ${emails.length} members to group ${group.name}`);
    
    // Find users by email
    const users = await User.find({
      email: { $in: emails }
    }).select('_id email name');
    
    console.log(`Found ${users.length} matching users`);
    
    const existingMembers = group.members.map(member => member.user.toString());
    let addedCount = 0;
    
    // Add users to group
    for (const user of users) {
      if (!existingMembers.includes(user._id.toString())) {
        group.members.push({
          user: user._id,
          role: 'member'
        });
        
        // Add group to user's groups
        await User.findByIdAndUpdate(user._id, {
          $addToSet: { groups: group._id }
        });
        
        addedCount++;
      }
    }
    
    // Update member count
    group.memberCount = group.members.length;
    await group.save();
    
    console.log(`Added ${addedCount} new members to the group`);
    
    res.status(200).json({
      success: true,
      message: `Added ${addedCount} new members to the group`,
      addedCount,
      totalMembers: group.memberCount
    });
    console.log('Add members response sent');
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add members',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Leave group
router.post('/:groupId/leave', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Leave group request for: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    
    // Remove user from group members
    const group = await Group.findByIdAndUpdate(
      groupId,
      {
        $pull: { members: { user: req.user._id } },
        $inc: { memberCount: -1 }
      },
      { new: true }
    );
    
    if (!group) {
      console.log('Group not found');
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    console.log(`User left group: ${group.name}`);
    
    // Remove group from user's groups
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { groups: groupId }
    });
    
    res.status(200).json({
      success: true,
      message: 'You have left the group'
    });
    console.log('Leave group response sent');
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave group',
      error: error.message
    });
  }
  console.log('--------------------------------------------------');
});

// Calculate and update simplified debts for a group
const updateSimplifiedDebts = async (groupId) => {
  try {
    const group = await Group.findById(groupId).populate('members.user');
    if (!group) return false;
    
    // Get all members
    const members = group.members.map(m => m.user._id.toString());
    
    // Create a matrix of debts between members
    const debtMatrix = {};
    members.forEach(m1 => {
      debtMatrix[m1] = {};
      members.forEach(m2 => {
        if (m1 !== m2) {
          debtMatrix[m1][m2] = 0;
        }
      });
    });
    
    // Fill the matrix from balances
    group.balances.forEach(balance => {
      const userId = balance.user.toString();
      const amount = balance.amount;
      
      if (amount < 0) {
        // User owes money, find who they owe
        const creditors = group.balances.filter(b => b.amount > 0);
        const totalCredit = creditors.reduce((sum, b) => sum + b.amount, 0);
        
        creditors.forEach(creditor => {
          const creditorId = creditor.user.toString();
          const proportion = creditor.amount / totalCredit;
          const amountOwed = Math.abs(amount) * proportion;
          
          debtMatrix[userId][creditorId] += amountOwed;
        });
      }
    });
    
    // Simplify debts using a greedy algorithm
    const simplifiedDebts = [];
    
    // Keep simplifying until no more debts
    let changes = true;
    while (changes) {
      changes = false;
      
      // Find largest debt
      let maxDebt = 0;
      let maxDebtor = null;
      let maxCreditor = null;
      
      for (const debtor in debtMatrix) {
        for (const creditor in debtMatrix[debtor]) {
          if (debtMatrix[debtor][creditor] > maxDebt) {
            maxDebt = debtMatrix[debtor][creditor];
            maxDebtor = debtor;
            maxCreditor = creditor;
          }
        }
      }
      
      if (maxDebt > 0.01) { // Ignore very small debts
        changes = true;
        simplifiedDebts.push({
          from: maxDebtor,
          to: maxCreditor,
          amount: maxDebt
        });
        
        debtMatrix[maxDebtor][maxCreditor] = 0;
      }
    }
    
    // Update group with simplified debts
    group.simplifiedDebts = simplifiedDebts;
    await group.save();
    
    return true;
  } catch (error) {
    console.error('Simplify debts error:', error);
    return false;
  }
};

module.exports = router;