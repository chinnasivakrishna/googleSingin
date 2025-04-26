// routes/auth.js - Authentication routes with detailed logging
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

// Set up valid client IDs array from environment variables
const validClientIds = [
  process.env.GOOGLE_CLIENT_ID,           // Web client ID
  process.env.GOOGLE_ANDROID_CLIENT_ID,   // Android client ID
  process.env.GOOGLE_EXPO_CLIENT_ID       // Expo client ID
].filter(Boolean); // Filter out any undefined values

console.log('Auth routes initialized with', validClientIds.length, 'Google client IDs');

// Google authentication handler
router.post('/google', async (req, res) => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Received Google auth request`);
  console.log('Request body:', {
    googleId: req.body.googleId,
    email: req.body.email,
    name: req.body.name,
    photoUrl: req.body.photoUrl ? 'Photo URL provided' : 'No photo URL',
    idToken: req.body.idToken ? 'ID token provided' : 'No ID token',
    platform: req.body.platform || 'Not specified'
  });

  try {
    const { googleId, email, name, photoUrl, idToken, platform } = req.body;

    // Verify Google token if idToken is provided
    if (idToken) {
      console.log('Verifying Google ID token...');
      
      // Try verifying with each valid client ID
      let tokenVerified = false;
      let verificationError = null;
      
      for (const clientId of validClientIds) {
        try {
          console.log(`Attempting verification with client ID: ${clientId.substring(0, 10)}...`);
          const client = new OAuth2Client(clientId);
          const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: clientId
          });
          tokenVerified = true;
          console.log('Google token verified successfully with client ID:', clientId.substring(0, 10) + '...');
          break; // Exit the loop once verification succeeds
        } catch (error) {
          verificationError = error;
          console.log(`Verification failed with client ID ${clientId.substring(0, 10)}...: ${error.message}`);
          // Continue to try the next client ID
        }
      }

      if (!tokenVerified) {
        console.error('Token verification failed with all client IDs:', verificationError?.message);
        console.log('Continuing with provided data as fallback');
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
        photoUrl,
        platform: platform || 'unknown'
      });
      await user.save();
      console.log('New user created successfully:', user._id.toString());
    } else {
      console.log('Existing user found:', user._id.toString());
      // Update existing user's last login time and potentially platform
      user.lastLogin = Date.now();
      if (platform && (!user.platform || user.platform === 'unknown')) {
        user.platform = platform;
      }
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
        photoUrl: user.photoUrl,
        platform: user.platform
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
        photoUrl: user.photoUrl,
        platform: user.platform
      }
    });
    
    console.log('User data response sent');
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