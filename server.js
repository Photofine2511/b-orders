const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const User = require('./models/userModel');
const path = require('path');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Admin credentials - same as previously used in localStorage
const ADMIN_EMAIL = 'admin@photofine.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'Administrator';

// Initialize admin user if not exists
const initializeAdmin = async () => {
  try {
    // Check if admin user already exists
    const adminExists = await User.findOne({ email: ADMIN_EMAIL });

    if (!adminExists) {
      // Create new admin user
      const adminUser = await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
      });

      if (adminUser) {
        console.log('Admin user created successfully:', adminUser.email);
      } else {
        console.error('Failed to create admin user');
      }
    }
  } catch (error) {
    console.error(`Error initializing admin: ${error.message}`);
  }
};

// Call the admin initialization function
initializeAdmin();

// Initialize the app
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: '*',
}));

// Logging middleware in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));

// Add this line after your app initialization
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// Define port
const PORT = process.env.PORT || 5000;

// Start server
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
}); 