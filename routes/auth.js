// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Google OAuth verification and user creation/update
router.post('/google', async (req, res) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({ message: 'Access token is required' });
    }

    // Verify the token with Google
    const googleUserInfo = await axios.get('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!googleUserInfo.data) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }
    
    const { id: googleId, email, name, picture } = googleUserInfo.data;
    
    // Find or create user
    let user = await User.findOne({ googleId });
    
    if (!user) {
      // Create new user
      user = new User({
        googleId,
        email,
        name,
        picture,
        accessToken
      });
    } else {
      // Update existing user
      user.lastLogin = Date.now();
      user.accessToken = accessToken;
      user.name = name;
      user.picture = picture;
    }
    
    await user.save();
    
    // Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user info and token
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture
      }
    });
    
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ 
      message: 'Authentication failed', 
      error: error.message 
    });
  }
});

// Logout route
router.post('/logout', async (req, res) => {
  try {
    // Nothing to do on server for logout with JWT
    // Client should remove the token
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;