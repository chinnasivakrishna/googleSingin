// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// User Model
const UserSchema = new mongoose.Schema({
    googleId: String,
    email: String,
    name: String,
    picture: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', UserSchema);

// Generate JWT token
const generateToken = (user) => {
    const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
    return jwt.sign(
        { id: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
};

// Verify Google token and create/update user
app.post('/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        // Verify token with Google
        const googleResponse = await axios.get(
            'https://www.googleapis.com/userinfo/v2/me',
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        const { id, email, name, picture } = googleResponse.data;

        // Find or create user
        let user = await User.findOne({ googleId: id });
        
        if (!user) {
            // Create new user
            user = await User.create({
                googleId: id,
                email,
                name,
                picture
            });
        } else {
            // Update existing user info
            user.email = email;
            user.name = name;
            user.picture = picture;
            await user.save();
        }

        // Generate JWT
        const userToken = generateToken(user);
        
        // Return user info and token
        res.json({
            token: userToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture
            }
        });
    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ 
            error: 'Authentication failed',
            details: error.message 
        });
    }
});

// Protected route to get user info
app.get('/api/user', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-__v');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
});

// Add logout route (just for API completeness)
app.post('/auth/logout', (req, res) => {
    // Nothing to do on server side for token-based auth
    res.json({ success: true, message: 'Logged out successfully' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));