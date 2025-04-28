const Order = require('../models/orderModel');
const { 
  getFileDownloadUrl, 
  deleteLocalFile, 
  uploadToDrive, 
  downloadFromDrive, 
  deleteFromDrive,
  getDriveClient
} = require('../config/drive');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// @desc    Create new order with file upload
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const {
      albumName,
      pageType,
      lamination,
      transparent,
      emboss,
      miniBook,
      coverType,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    // Get the file path and information
    const filePath = req.file.path;
    const relativePath = path.basename(filePath);
    
    // Determine storage provider
    let storageProvider = 'local';
    let fileUrl = null;
    let driveFileId = null;
    let driveFileLink = null;

    // Try to upload to Google Drive if available
    try {
      // Check if Google Drive client is available
      if (getDriveClient()) {
        // Upload file to Google Drive
        const driveFile = await uploadToDrive(
          filePath,
          req.file.originalname,
          req.file.mimetype
        );

        if (driveFile) {
          // File was successfully uploaded to Google Drive
          storageProvider = 'google_drive';
          driveFileId = driveFile.id;
          driveFileLink = driveFile.webContentLink || driveFile.webViewLink;
          fileUrl = getFileDownloadUrl(req, null, driveFileId);
          
          // Delete the local file since we now have it in Google Drive
          await deleteLocalFile(filePath);
          console.log(`Local file deleted after Google Drive upload: ${filePath}`);
        }
      }
    } catch (driveError) {
      console.error('Error uploading to Google Drive, falling back to local storage:', driveError);
    }

    // If Google Drive upload failed or wasn't attempted, use local storage
    if (storageProvider === 'local') {
      fileUrl = getFileDownloadUrl(req, relativePath);
    }

    // Create order with file information
    const order = new Order({
      user: req.user._id,
      albumName,
      fileUrl,
      originalFilename: req.file.originalname,
      serverFilename: relativePath,
      fileSize: req.file.size,
      pageType,
      lamination,
      transparent: transparent === 'true',
      emboss: emboss === 'true',
      miniBook: miniBook === 'true',
      coverType,
      storageProvider,
      driveFileId,
      driveFileLink
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all orders for logged in user
// @route   GET /api/orders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (order) {
      // Check if the order belongs to the user or if the user is an admin
      if (order.user._id.toString() === req.user._id.toString() || req.user.role === 'admin') {
        res.json(order);
      } else {
        res.status(401).json({ message: 'Not authorized to view this order' });
      }
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all orders (admin only)
// @route   GET /api/orders/all
// @access  Private/Admin
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).populate('user', 'name email');
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (order) {
      order.status = status;
      
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Download order file
// @route   GET /api/orders/:id/download
// @access  Private/Admin
const downloadOrderFile = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is authorized
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Handle Google Drive files
    if (order.storageProvider === 'google_drive' && order.driveFileId) {
      try {
        const driveFile = await downloadFromDrive(order.driveFileId);
        
        if (driveFile && driveFile.data) {
          res.setHeader('Content-Type', driveFile.mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${order.originalFilename}"`);
          return driveFile.data.pipe(res);
        } else {
          throw new Error('Drive file could not be downloaded');
        }
      } catch (driveError) {
        console.error('Google Drive download error:', driveError);
        return res.status(500).json({ 
          message: 'Error downloading from Google Drive', 
          error: driveError.message
        });
      }
    }

    // Handle local files
    if (order.storageProvider === 'local' && order.serverFilename) {
      const filePath = path.join(__dirname, '..', 'uploads', order.serverFilename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'File not found on server' });
      }
      
      // Send file
      return res.download(filePath, order.originalFilename);
    }

    // If we get here, we don't know how to handle this file
    res.status(400).json({ message: 'Cannot download file' });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Download file directly from Google Drive
// @route   GET /api/orders/drive/:fileId/download
// @access  Private
const downloadDriveFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({ message: 'File ID is required' });
    }
    
    const driveFile = await downloadFromDrive(fileId);
    
    if (driveFile && driveFile.data) {
      res.setHeader('Content-Type', driveFile.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${driveFile.name || 'download'}"`);
      return driveFile.data.pipe(res);
    } else {
      return res.status(404).json({ message: 'File not found on Google Drive' });
    }
  } catch (error) {
    console.error('Google Drive direct download error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add notes to an order
// @route   PUT /api/orders/:id/notes
// @access  Private/Admin
const addOrderNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    
    const order = await Order.findById(req.params.id);
    
    if (order) {
      order.adminNotes = notes;
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete an order
// @route   DELETE /api/orders/:id
// @access  Private/Admin
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Delete uploaded file
    if (order.storageProvider === 'local' && order.serverFilename) {
      const filePath = path.join(__dirname, '..', 'uploads', order.serverFilename);
      try {
        if (fs.existsSync(filePath)) {
          await deleteLocalFile(filePath);
          console.log(`Successfully deleted local file: ${filePath}`);
        }
      } catch (fileDeleteError) {
        console.error(`Error deleting local file: ${fileDeleteError.message}`);
        // Continue with order deletion even if file deletion fails
      }
    } else if (order.storageProvider === 'google_drive' && order.driveFileId) {
      try {
        await deleteFromDrive(order.driveFileId);
        console.log(`Successfully deleted Google Drive file: ${order.driveFileId}`);
      } catch (driveDeleteError) {
        console.error(`Error deleting Google Drive file: ${driveDeleteError.message}`);
        // Continue with order deletion even if file deletion fails
      }
    }
    
    // Delete the order
    await order.remove();
    
    res.json({ message: 'Order deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  downloadOrderFile,
  downloadDriveFile,
  addOrderNotes,
  deleteOrder
}; 