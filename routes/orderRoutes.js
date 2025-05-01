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

// @route   POST /api/orders
router.post('/', protect, upload.single('file'), createOrder);

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
router.post('/upload-to-drive', protect, upload.array('albumFiles', 100), uploadToDriveOnly);

module.exports = router; 