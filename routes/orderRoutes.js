const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  downloadOrderFile,
  downloadDriveFile,
  addOrderNotes,
  deleteOrder,
  uploadToDriveOnly
} = require('../controllers/orderController');
const { protect, admin } = require('../middleware/authMiddleware');
const { upload } = require('../config/drive');

// Import the new controller functions
const { uploadLargeFileToDrive, checkUploadStatus } = require('../controllers/uploadController');

// POST routes
router.post('/', protect, upload.any(), createOrder);

// Add direct Google Drive upload routes
router.post('/upload-to-drive', protect, upload.any(), uploadToDriveOnly);
router.post('/upload-large-file-to-drive', protect, upload.any(), uploadLargeFileToDrive);

// GET routes - IMPORTANT: Place specific routes before parameterized routes
router.get('/check-upload-status', protect, checkUploadStatus); // This must come before '/:id'
router.get('/', protect, getMyOrders);
router.get('/all', protect, admin, getAllOrders);
router.get('/drive/:fileId/download', protect, downloadDriveFile);

// Order detail routes with params - these must come after specific routes
router.get('/:id', protect, getOrderById);
router.get('/:id/download', protect, admin, downloadOrderFile);
router.put('/:id/status', protect, admin, updateOrderStatus);
router.put('/:id/notes', protect, admin, addOrderNotes);
router.delete('/:id', protect, admin, deleteOrder);

module.exports = router; 