const Order = require('../models/orderModel');
const { 
  getFileDownloadUrl, 
  deleteLocalFile, 
  uploadToDrive, 
  downloadFromDrive, 
  deleteFromDrive,
  getDriveClient,
  getFileFromDrive
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
      driveFileId
    } = req.body;

    let fileUrl = null;
    let serverFilename = null;
    let originalFilename = null;
    let fileSize = 0;
    let storageProvider = 'local';
    let finalDriveFileId = null;
    let driveFileLink = null;

    // Case 1: Using an existing Google Drive file ID
    if (driveFileId) {
      try {
        // Verify that the file exists in Google Drive and get its details
        const driveFile = await getFileFromDrive(driveFileId);
        
        // If we have the drive file, we can use it directly
        if (driveFile) {
          storageProvider = 'google_drive';
          finalDriveFileId = driveFile.id;
          driveFileLink = driveFile.webContentLink || driveFile.webViewLink;
          fileUrl = getFileDownloadUrl(req, null, driveFile.id);
          
          // Get file details from the form data or from Drive
          originalFilename = req.body.fileName_info || driveFile.name;
          fileSize = parseInt(req.body.fileSize_info) || driveFile.size || 0;
          
          console.log(`Using existing Google Drive file: ${finalDriveFileId}`);
        } else {
          throw new Error('Drive file not found');
        }
      } catch (driveError) {
        console.error('Error verifying Google Drive file:', driveError);
        return res.status(400).json({ 
          message: 'Error with the provided Google Drive file ID. Please try uploading again.'
        });
      }
    }
    // Case 2: Upload a new file
    else if (req.file) {
      // Get the file path and information
      const filePath = req.file.path;
      const relativePath = path.basename(filePath);
      serverFilename = relativePath;
      originalFilename = req.file.originalname;
      fileSize = req.file.size;
      
      // Always try to upload to Google Drive
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
            finalDriveFileId = driveFile.id;
            driveFileLink = driveFile.webContentLink || driveFile.webViewLink;
            fileUrl = getFileDownloadUrl(req, null, driveFile.id);
            
            // Delete the local file since we now have it in Google Drive
            await deleteLocalFile(filePath);
            console.log(`Local file deleted after Google Drive upload: ${filePath}`);
          } else {
            throw new Error('Failed to upload to Google Drive');
          }
        } else {
          throw new Error('Google Drive client not available');
        }
      } catch (driveError) {
        console.error('Error uploading to Google Drive:', driveError);
        return res.status(500).json({ 
          message: 'Error uploading to Google Drive. Please try again.', 
          error: driveError.message 
        });
      }
    } else {
      return res.status(400).json({ message: 'Please upload a file, folder, or provide a valid Drive file ID' });
    }

    // Create order with file information
    const order = new Order({
      user: req.user._id,
      albumName,
      fileUrl,
      originalFilename,
      serverFilename,
      fileSize,
      pageType,
      lamination,
      transparent: transparent === 'true',
      emboss: emboss === 'true',
      miniBook: miniBook === 'true',
      coverType,
      storageProvider,
      driveFileId: finalDriveFileId,
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

// @desc    Upload file directly to Google Drive only (no order creation)
// @route   POST /api/orders/upload-to-drive
// @access  Private
const uploadToDriveOnly = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    // Get the file path and information
    const filePath = req.file.path;
    
    // Check if Google Drive client is available
    if (!getDriveClient()) {
      return res.status(500).json({ 
        message: 'Google Drive storage is not available. Please try the standard upload method.' 
      });
    }
    
    try {
      // Upload file to Google Drive with increased timeout
      const driveFile = await uploadToDrive(
        filePath,
        req.file.originalname,
        req.file.mimetype
      );

      if (driveFile) {
        // File was successfully uploaded to Google Drive
        const fileUrl = driveFile.webContentLink || driveFile.webViewLink;
        
        // Delete the local file since we now have it in Google Drive
        await deleteLocalFile(filePath);
        
        return res.status(200).json({
          success: true,
          message: 'File uploaded to Google Drive successfully',
          fileInfo: {
            id: driveFile.id,
            name: driveFile.name,
            size: driveFile.size,
            url: fileUrl
          }
        });
      } else {
        return res.status(500).json({ 
          message: 'Failed to upload to Google Drive. Please try again.' 
        });
      }
    } catch (driveError) {
      console.error('Error uploading to Google Drive:', driveError);
      return res.status(500).json({ 
        message: 'Error uploading to Google Drive',
        error: driveError.message
      });
    }
  } catch (error) {
    console.error('Server error during Google Drive upload:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
  deleteOrder,
  uploadToDriveOnly
}; 