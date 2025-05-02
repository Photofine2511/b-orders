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

// @route   POST /api/orders
router.post('/', protect, upload.any(), createOrder);

// @route   GET /api/orders
router.get('/', protect, getMyOrders);

// @route   GET /api/orders/all
router.get('/all', protect, admin, getAllOrders);

// @route   GET /api/orders/:id
router.get('/:id', protect, getOrderById);

// @route   PUT /api/orders/:id/status
router.put('/:id/status', protect, admin, updateOrderStatus);

// @route   GET /api/orders/:id/download
router.get('/:id/download', protect, admin, downloadOrderFile);

// @route   GET /api/orders/drive/:fileId/download
router.get('/drive/:fileId/download', protect, downloadDriveFile);

// @route   PUT /api/orders/:id/notes
router.put('/:id/notes', protect, admin, addOrderNotes);

// @route   DELETE /api/orders/:id
router.delete('/:id', protect, admin, deleteOrder);

// Add direct Google Drive upload route for large files
router.post('/upload-to-drive', protect, upload.any(), uploadToDriveOnly);

// New upload routes for large files
router.post('/upload-large-file-to-drive', protect, upload.any(), uploadLargeFileToDrive);
router.get('/check-upload-status', protect, checkUploadStatus);

module.exports = router; 