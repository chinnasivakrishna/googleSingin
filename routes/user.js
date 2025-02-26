// routes/user.js - User data routes with logging
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');

// Get user profile data
router.get('/profile', authMiddleware, async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Profile request for user: ${req.user._id}`);
  
  try {
    const userId = req.user._id;
    console.log('Finding user profile data for ID:', userId);
    
    // Get user profile data
    const user = await User.findById(userId).select('name email photoUrl');
    
    if (!user) {
      console.log('User not found');
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    console.log('User profile found:', user.email);
    
    // Get current time to determine greeting
    const currentHour = new Date().getHours();
    let greeting = "Good Morning";
    
    if (currentHour >= 12 && currentHour < 17) {
      greeting = "Good Afternoon";
    } else if (currentHour >= 17) {
      greeting = "Good Evening";
    }
    console.log('Greeting set based on time:', greeting);

    console.log('Sending user profile response');
    res.status(200).json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl
      },
      greeting
    });
    console.log('Profile response sent successfully');
  } catch (error) {
    console.error('User profile fetch error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load user profile',
      error: error.message
    });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

module.exports = router;