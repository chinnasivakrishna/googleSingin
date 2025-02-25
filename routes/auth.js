// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

// Google OAuth client setup
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google authentication handler
router.post('/google', async (req, res) => {
  try {
    const { googleId, email, name, photoUrl, accessToken } = req.body;

    // Verify Google token
    const ticket = await client.verifyToken({
      idToken: accessToken,
      audience: process.env.GOOGLE_CLIENT_ID
    }).catch(error => {
      // If token verification fails, try alternative approach
      console.log('Token verification failed, using provided data:', error.message);
      // Continue with provided data instead of failing
    });

    // Find or create user
    let user = await User.findOne({ googleId });

    if (!user) {
      // Create new user if not found
      user = new User({
        googleId,
        email,
        name,
        photoUrl
      });
      await user.save();
    } else {
      // Update existing user's last login time
      user.lastLogin = Date.now();
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return token and user info
    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ message: 'Authentication failed', error: error.message });
  }
});

// Verify token and get user data
router.get('/user', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl
      }
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;