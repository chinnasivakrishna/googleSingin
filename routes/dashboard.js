// routes/dashboard.js - Dashboard routes for group management
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');

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

module.exports = router;