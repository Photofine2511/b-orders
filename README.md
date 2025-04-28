# Photofine Color Lab Backend API

This is the backend API for the Photofine Color Lab application, which allows photographers to submit album orders and admins to manage those orders.

## Features

- User authentication (login, registration)
- File uploads for photo albums (using Cloudinary)
- Order management
- Admin dashboard functionality
- Download functionality for admin users

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- JWT for authentication
- Cloudinary for file storage
- Multer for file uploads

## Setup Instructions

1. Install MongoDB locally or use MongoDB Atlas
2. Create a Cloudinary account (https://cloudinary.com)
3. Clone the repository
4. Navigate to the server directory
5. Install dependencies with `npm install`
6. Create a `.env` file with the following variables:
   ```
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/photoalbum
   JWT_SECRET=your_secret_key
   NODE_ENV=development
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
7. Start the server with `npm run dev`

## API Endpoints

### Authentication

- `POST /api/users` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/profile` - Get user profile (protected)
- `GET /api/users/photographers` - Get all photographers (admin only)

### Orders

- `POST /api/orders` - Create a new order with file upload (protected)
- `GET /api/orders` - Get all orders for logged in user (protected)
- `GET /api/orders/all` - Get all orders (admin only)
- `GET /api/orders/:id` - Get order by ID (protected)
- `PUT /api/orders/:id/status` - Update order status (admin only)
- `GET /api/orders/:id/download` - Download order file (admin only)
- `PUT /api/orders/:id/notes` - Add admin notes to order (admin only)
- `DELETE /api/orders/:id` - Delete order and its file (admin only)

## Folder Structure

```
server/
├── config/         # Database and Cloudinary configuration
├── controllers/    # Route controllers
├── middleware/     # Custom middleware
├── models/         # Mongoose models
├── routes/         # API routes
├── .env            # Environment variables
├── package.json    # Dependencies
└── server.js       # Entry point
``` 