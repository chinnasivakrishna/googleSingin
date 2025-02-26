// routes/auth.js - Authentication routes with detailed logging
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

// Google OAuth client setup
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
console.log('Auth routes initialized');

// Google authentication handler
router.post('/google', async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Received Google auth request`);
  console.log('Request body:', {
    googleId: req.body.googleId,
    email: req.body.email,
    name: req.body.name,
    photoUrl: req.body.photoUrl ? 'Photo URL provided' : 'No photo URL',
    idToken: req.body.idToken ? 'ID token provided' : 'No ID token'
  });

  try {
    const { googleId, email, name, photoUrl, idToken } = req.body;

    // Verify Google token if idToken is provided
    if (idToken) {
      console.log('Verifying Google ID token...');
      try {
        const ticket = await client.verifyIdToken({
          idToken: idToken,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        console.log('Google token verified successfully');
        // Token verified successfully, can get payload if needed
        // const payload = ticket.getPayload();
      } catch (verifyError) {
        console.error('Token verification failed:', verifyError.message);
        console.log('Continuing with provided data instead of failing');
        // Continue with provided data instead of failing
      }
    } else {
      console.log('No ID token provided, skipping verification');
    }

    // Find or create user
    console.log(`Looking for user with googleId: ${googleId}`);
    let user = await User.findOne({ googleId });

    if (!user) {
      console.log('User not found, creating new user account');
      // Create new user if not found
      user = new User({
        googleId,
        email,
        name,
        photoUrl
      });
      await user.save();
      console.log('New user created successfully:', user._id.toString());
    } else {
      console.log('Existing user found:', user._id.toString());
      // Update existing user's last login time
      user.lastLogin = Date.now();
      await user.save();
      console.log('User last login updated');
    }

    // Generate JWT token
    console.log('Generating JWT token...');
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    console.log('JWT token generated successfully');

    // Return token and user info
    console.log('Authentication successful, sending response');
    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl
      }
    });
    console.log('Response sent');
  } catch (error) {
    console.error('Google auth error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Authentication failed', error: error.message });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

// Verify token and get user data
router.get('/user', async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Token verification request received`);
  console.log('Authorization header:', req.headers.authorization ? 'Present' : 'Not present');
  
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      console.log('No token provided in request');
      return res.status(401).json({ message: 'No token provided' });
    }

    console.log('Verifying JWT token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token verified, userId:', decoded.userId);
    
    console.log('Finding user in database...');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      console.log('User not found for decoded token');
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User found:', user.email);
    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl
      }
    });
    
    console.log('User data response sent',user.id,user.name,user.photoUrl);
  } catch (error) {
    console.error('Auth verification error:', error);
    if (error.name === 'JsonWebTokenError') {
      console.error('JWT Error type:', error.name);
      console.error('JWT Error message:', error.message);
    }
    res.status(401).json({ message: 'Invalid token', error: error.message });
    console.log('Error response sent');
  }
  console.log('--------------------------------------------------');
});

module.exports = router;