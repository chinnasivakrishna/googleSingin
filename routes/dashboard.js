// routes/dashboard.js - Dashboard data routes with logging
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');

// Get user dashboard data (profile and recommended groups)
router.get('/', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Dashboard data request for user: ${req.user._id}`);
  
  try {
    const userId = req.user._id;
    console.log('Fetching dashboard data for user ID:', userId);

    // Get user profile data
    console.log('Finding user profile data');
    const user = await User.findById(userId).select('name email photoUrl');
    
    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('User profile found:', user.email);
    
    // Get recommended groups for the user
    console.log('Fetching recommended groups');
    let recommendedGroups = [];
    
    try {
      recommendedGroups = await Group.find()
        .limit(5)
        .select('name description photoUrl memberCount')
        .sort({ createdAt: -1 });
      console.log(`Found ${recommendedGroups.length} recommended groups`);
    } catch (groupError) {
      console.error('Error fetching groups, continuing:', groupError.message);
      // Continue even if group fetching fails
      recommendedGroups = [];
    }
    
    // Get current time to determine greeting
    const currentHour = new Date().getHours();
    let greeting = "Good Morning";
    
    if (currentHour >= 12 && currentHour < 17) {
      greeting = "Good Afternoon";
    } else if (currentHour >= 17) {
      greeting = "Good Evening";
    }
    console.log('Greeting set based on time:', greeting);

    console.log('Sending dashboard response');
    res.status(200).json({
      user,
      greeting,
      recommendedGroups
    });
    console.log('Dashboard response sent successfully');
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Failed to load dashboard data', 
      error: error.message 
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Get notifications count
router.get('/notifications/count', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Notification count request for user: ${req.user._id}`);
  
  try {
    console.log('Calculating notification count');
    // This would connect to your notifications system
    // Simplified example - in a real app you'd query notifications collection
    const unreadCount = Math.floor(Math.random() * 5); // Dummy data for example
    console.log('Unread notification count:', unreadCount);
    
    console.log('Sending notification count response');
    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error('Notification count error:', error);
    res.status(500).json({ 
      message: 'Failed to get notification count', 
      error: error.message 
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Search people, groups and events
router.get('/search', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Search request from user: ${req.user._id}`);
  console.log('Search query:', req.query.query);
  
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      console.log('Search query too short, returning empty results');
      return res.status(200).json({ results: [] });
    }
    
    console.log('Searching for groups matching:', query);
    // Search for matching groups
    let groups = [];
    try {
      groups = await Group.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ]
      }).limit(5).select('name description photoUrl');
      console.log(`Found ${groups.length} matching groups`);
    } catch (groupError) {
      console.error('Error searching groups:', groupError.message);
      groups = [];
    }
    
    console.log('Searching for users matching:', query);
    // Search for matching users
    let users = [];
    try {
      users = await User.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } }
        ]
      }).limit(5).select('name email photoUrl');
      console.log(`Found ${users.length} matching users`);
    } catch (userError) {
      console.error('Error searching users:', userError.message);
      users = [];
    }
    
    console.log('Sending search results');
    res.status(200).json({
      results: {
        groups,
        users
      }
    });
    console.log('Search response sent successfully');
  } catch (error) {
    console.error('Search error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Search failed', 
      error: error.message 
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

module.exports = router;