// middleware/auth.js - JWT authentication middleware with logging
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] Auth middleware processing request to ${req.originalUrl}`);
  console.log('Authorization header:', req.headers.authorization ? 'Present' : 'Not present');
  
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      console.log('No token provided, authentication required');
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Verify token
    console.log('Verifying JWT token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token verified, userId:', decoded.userId);
    
    // Find user
    console.log('Finding user in database...');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      console.log('User not found for valid token');
      return res.status(404).json({ message: 'User not found' });
    }

    // Add user to request object
    console.log('User authenticated successfully:', user.email);
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    if (error.name === 'JsonWebTokenError') {
      console.error('JWT Error type:', error.name);
      console.error('JWT Error message:', error.message);
    }
    return res.status(401).json({ message: 'Invalid token', error: error.message });
  }
};

module.exports = authMiddleware;