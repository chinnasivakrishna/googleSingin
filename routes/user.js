// routes/user.js - Simple user data route
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');

// Get user profile data
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get user profile data
    const user = await User.findById(userId).select('name email photoUrl');
    
    // Get current time to determine greeting
    const currentHour = new Date().getHours();
    let greeting = "Good Morning";
    
    if (currentHour >= 12 && currentHour < 17) {
      greeting = "Good Afternoon";
    } else if (currentHour >= 17) {
      greeting = "Good Evening";
    }

    res.status(200).json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl
      },
      greeting
    });
  } catch (error) {
    console.error('User profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load user profile' });
  }
});

module.exports = router;