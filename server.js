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

// Endpoint to handle the authorization code from the frontend
app.post('/auth/google/callback', async (req, res) => {
    try {
        const { code, redirectUri } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }
        
        console.log('Received code from frontend. Exchanging for tokens...');
        
        // Exchange the authorization code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });
        
        const { access_token } = tokenResponse.data;
        
        if (!access_token) {
            throw new Error('Failed to obtain access token from Google');
        }
        
        console.log('Got access token. Fetching user info...');
        
        // Use the access token to get user information
        const userInfoResponse = await axios.get('https://www.googleapis.com/userinfo/v2/me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        
        const { id: googleId, email, name, picture } = userInfoResponse.data;
        
        console.log('Received user info for:', email);
        
        // Find or create user in the database
        let user = await User.findOne({ googleId });
        
        if (!user) {
            user = await User.create({
                googleId,
                email,
                name,
                picture
            });
            console.log('Created new user:', email);
        } else {
            user.email = email;
            user.name = name;
            user.picture = picture;
            await user.save();
            console.log('Updated existing user:', email);
        }
        
        // Generate JWT token for the authenticated user
        const userToken = generateToken(user);
        
        // Return the user info and token
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
        console.error('Google Auth Error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Authentication failed',
            details: error.response?.data || error.message
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));