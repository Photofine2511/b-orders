const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

// Middleware to protect routes that require authentication
const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // Check for token in query parameters (for download links)
  else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      next();
      return; // Exit the middleware
    } catch (error) {
      console.error(error);
      res.status(401);
      res.json({ message: 'Not authorized, token failed' });
      return; // Exit the middleware
    }
  }

  // No token found
  res.status(401);
  res.json({ message: 'Not authorized, no token' });
};

// Middleware to check if user is an admin
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(401);
    res.json({ message: 'Not authorized as an admin' });
  }
};

module.exports = { protect, admin }; 