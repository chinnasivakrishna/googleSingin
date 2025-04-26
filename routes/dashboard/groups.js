const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../../middleware/auth');
const User = require('../../models/User');
const Group = require('../../models/Group');

// Get all groups for a user
router.get('/', authMiddleware, async (req, res) => {
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
    
    // Combine and remove duplicates
    const allGroups = [...adminGroups];
    memberGroups.forEach(group => {
      if (!allGroups.find(g => g._id.toString() === group._id.toString())) {
        allGroups.push(group);
      }
    });
    
    res.status(200).json({
      success: true,
      groups: allGroups.map(group => ({
        _id: group._id,
        name: group.name,
        description: group.description,
        photoUrl: group.photoUrl,
        memberCount: group.memberCount,
        isAdmin: group.admin.toString() === userId.toString(),
        memberStatus: group.admin.toString() === userId.toString() 
          ? 'admin' 
          : group.members.find(m => m.user.toString() === userId.toString())?.status || 'unknown'
      }))
    });
  } catch (error) {
    console.error('Groups fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load groups',
      error: error.message
    });
  }
});

// Create a new group
router.post('/create', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Create group request from user: ${req.user._id}`);
  
  try {
    const { name, description, members } = req.body;
    const userId = req.user._id;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }
    
    const newGroup = new Group({
      name,
      description,
      admin: userId,
      members: []
    });
    
    if (members && members.length > 0) {
      const invitedMembers = [];
      for (const email of members) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (user && user._id.toString() !== userId.toString()) {
          invitedMembers.push({
            user: user._id,
            status: 'pending',
            role: 'member'
          });
          
          await User.findByIdAndUpdate(user._id, {
            $addToSet: { groups: newGroup._id }
          });
        }
      }
      
      newGroup.members = invitedMembers;
    }
    
    await newGroup.save();
    
    await User.findByIdAndUpdate(userId, {
      $addToSet: { groups: newGroup._id }
    });
    
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
  } catch (error) {
    console.error('Group creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create group',
      error: error.message
    });
  }
});

// Get group details
router.get('/:groupId', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Group details request for: ${req.params.groupId}`);
  
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
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
        message: 'You do not have access to this group'
      });
    }
    
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
  } catch (error) {
    console.error('Group details fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load group details',
      error: error.message
    });
  }
});

// Invite member to group
router.post('/:groupId/invite', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Invite member request for group: ${req.params.groupId}`);

  try {
    const { groupId } = req.params;
    const { email } = req.body;
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

    if (group.admin.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the group admin can invite members'
      });
    }

    const userToInvite = await User.findOne({ email: email.toLowerCase() });
    if (!userToInvite) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isAlreadyMember = group.members.some(member => 
      member.user.toString() === userToInvite._id.toString()
    );
    
    if (isAlreadyMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of the group'
      });
    }

    group.members.push({
      user: userToInvite._id,
      status: 'pending',
      role: 'member'
    });

    await group.save();

    res.status(200).json({
      success: true,
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invitation',
      error: error.message
    });
  }
});

module.exports = router; 