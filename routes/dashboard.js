// routes/dashboard.js - Dashboard data routes
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');

// Get user dashboard data (profile and recommended groups)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user profile data
    const user = await User.findById(userId).select('name email photoUrl');
    
    // Get recommended groups for the user (simplified example)
    // In a real app, you might have more complex recommendation logic
    const recommendedGroups = await Group.find()
      .limit(5)
      .select('name description photoUrl memberCount')
      .sort({ createdAt: -1 });
    
    // Get current time to determine greeting
    const currentHour = new Date().getHours();
    let greeting = "Good Morning";
    
    if (currentHour >= 12 && currentHour < 17) {
      greeting = "Good Afternoon";
    } else if (currentHour >= 17) {
      greeting = "Good Evening";
    }

    res.status(200).json({
      user,
      greeting,
      recommendedGroups
    });
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    res.status(500).json({ message: 'Failed to load dashboard data', error: error.message });
  }
});

// Get notifications count
router.get('/notifications/count', authMiddleware, async (req, res) => {
  try {
    // This would connect to your notifications system
    // Simplified example - in a real app you'd query notifications collection
    const unreadCount = Math.floor(Math.random() * 5); // Dummy data for example
    
    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error('Notification count error:', error);
    res.status(500).json({ message: 'Failed to get notification count', error: error.message });
  }
});

// Search people, groups and events
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(200).json({ results: [] });
    }
    
    // Search for matching groups
    const groups = await Group.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    }).limit(5).select('name description photoUrl');
    
    // Search for matching users
    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).limit(5).select('name email photoUrl');
    
    res.status(200).json({
      results: {
        groups,
        users
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Search failed', error: error.message });
  }
});

module.exports = router;