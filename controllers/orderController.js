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
        // Get file metadata to determine if it's a folder
        const drive = getDriveClient();
        if (!drive) {
          throw new Error('Google Drive client not available');
        }
        
        const fileMetadata = await drive.files.get({
          fileId: order.driveFileId,
          fields: 'mimeType,webViewLink'
        });
        
        // Check if this is a folder based on mime type
        if (fileMetadata.data.mimeType === 'application/vnd.google-apps.folder') {
          console.log(`Redirecting to Google Drive folder: ${order.albumName}`);
          // For folders, redirect to Google Drive instead of trying to download
          return res.redirect(fileMetadata.data.webViewLink);
        }
        
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
    
    // Get file metadata to determine if it's a folder
    const drive = getDriveClient();
    if (!drive) {
      throw new Error('Google Drive client not available');
    }
    
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'mimeType,webViewLink,name'
    });
    
    // Check if this is a folder based on mime type
    if (fileMetadata.data.mimeType === 'application/vnd.google-apps.folder') {
      console.log(`Redirecting to Google Drive folder: ${fileMetadata.data.name}`);
      // For folders, redirect to Google Drive instead of trying to download
      return res.redirect(fileMetadata.data.webViewLink);
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
    // Check if Google Drive client is available first
    if (!getDriveClient()) {
      console.error('Google Drive client not available');
      return res.status(500).json({ 
        message: 'Google Drive storage is not available. Please try again later.' 
      });
    }

    // Add detailed request logging
    console.log(`Upload request received:
      - Files: ${req.files ? req.files.length : (req.file ? '1 (single)' : '0')} 
      - isFolder: ${req.body.isFolder === 'true' ? 'Yes' : 'No'}
      - folderName: ${req.body.folderName || 'N/A'}
      - Content Type: ${req.headers['content-type'] || 'Not specified'}
      - Content Length: ${req.headers['content-length'] || 'Not specified'} bytes
    `);
    
    // Log the file fields we received
    if (req.files && req.files.length > 0) {
      console.log(`Fields of first file: ${JSON.stringify({
        fieldname: req.files[0].fieldname,
        originalname: req.files[0].originalname,
        mimetype: req.files[0].mimetype,
        size: req.files[0].size
      })}`);
    }
    
    // For debugging, display all field names from the request
    console.log(`Request body fields: ${Object.keys(req.body).join(', ')}`);
    
    // Now handle both array files and single files together
    const allFiles = req.files || (req.file ? [req.file] : []);
    
    // Early return if no files
    if (allFiles.length === 0) {
      console.error('No files received in request');
      return res.status(400).json({ message: 'No files received. Please upload at least one file or folder.' });
    }
    
    // Is this a folder upload?
    const isFolder = req.body.isFolder === 'true';
    const folderName = req.body.folderName || 'Uploaded Folder';
    
    // If it's a folder upload with multiple files
    if (isFolder && allFiles.length > 1) {
      console.log(`Processing folder upload: ${folderName} with ${allFiles.length} files`);
      
      // First, create a folder in Google Drive
      const drive = getDriveClient();
      const folderMetadata = {
        name: folderName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      try {
        // Create the folder
        const folderResponse = await drive.files.create({
          resource: folderMetadata,
          fields: 'id,name,webViewLink'
        });
        
        const folderId = folderResponse.data.id;
        console.log(`Folder created in Google Drive with ID: ${folderId}`);
        
        // Make folder publicly accessible
        await drive.permissions.create({
          fileId: folderId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });
        
        // Keep track of uploaded files
        const uploadedFiles = [];
        const filePaths = [];
        const errorFiles = [];
        
        // Now upload each file to this folder
        console.log(`Starting upload of ${allFiles.length} files to folder ${folderId}`);
        
        for (const file of allFiles) {
          try {
            // Extract relative path from file info
            let relativePath = '';
            
            if (file.originalname.includes('/')) {
              // Extract path from originalname if available (preserves subdirectories)
              const pathParts = file.originalname.split('/');
              relativePath = pathParts.slice(0, -1).join('/');
              console.log(`File ${file.originalname} has path ${relativePath}`);
            } else if (file.webkitRelativePath) {
              // Use webkitRelativePath if available
              const pathParts = file.webkitRelativePath.split('/');
              relativePath = pathParts.slice(0, -1).join('/');
              console.log(`File ${file.originalname} has webkitRelativePath ${relativePath}`);
            }
            
            console.log(`Uploading file: ${file.originalname} (${file.size} bytes) to Google Drive folder ${folderId}`);
            filePaths.push(file.path);
            
            // Upload the file to the folder
            const driveFile = await uploadToDrive(
              file.path,
              file.originalname,
              file.mimetype,
              folderId // Pass folder ID to upload inside this folder
            );
            
            if (driveFile) {
              console.log(`Successfully uploaded ${file.originalname} to Google Drive with ID ${driveFile.id}`);
              uploadedFiles.push({
                name: driveFile.name,
                id: driveFile.id,
                size: driveFile.size || file.size,
                url: driveFile.webContentLink || driveFile.webViewLink
              });
            } else {
              console.error(`File upload failed for ${file.originalname} - drive returned null`);
              errorFiles.push(file.originalname);
            }
          } catch (fileError) {
            console.error(`Error uploading file ${file.originalname}:`, fileError);
            errorFiles.push(file.originalname);
          }
        }
        
        // Clean up local files after upload
        console.log(`Upload complete. Cleaning up ${filePaths.length} temporary files.`);
        for (const filePath of filePaths) {
          try {
            if (fs.existsSync(filePath)) {
              await deleteLocalFile(filePath);
            }
          } catch (deleteError) {
            console.error(`Error deleting local file ${filePath}:`, deleteError);
          }
        }
        
        // Return information about the folder and files
        return res.status(200).json({
          success: true,
          message: `Folder with ${uploadedFiles.length} files uploaded to Google Drive successfully${errorFiles.length > 0 ? ` (${errorFiles.length} files failed)` : ''}`,
          fileInfo: {
            id: folderId, // This is the folder ID
            name: folderName,
            isFolder: true,
            fileCount: uploadedFiles.length,
            url: folderResponse.data.webViewLink,
            mimeType: 'application/vnd.google-apps.folder', // Explicitly mark the mime type
            files: uploadedFiles,
            errors: errorFiles.length > 0 ? errorFiles : undefined
          }
        });
        
      } catch (folderError) {
        console.error('Error creating folder in Google Drive:', folderError);
        return res.status(500).json({
          message: 'Error creating folder in Google Drive',
          error: folderError.message
        });
      }
    } 
    // If it's a single file upload
    else if (allFiles.length === 1) {
      const file = allFiles[0];
      const filePath = file.path;
      
      try {
        console.log(`Uploading single file to Google Drive: ${file.originalname} (${file.size} bytes)`);
        console.log(`File details: fieldname=${file.fieldname}, mimetype=${file.mimetype}`);
        
        // Check for supported file types
        const fileName = file.originalname.toLowerCase();
        const validExtensions = ['.zip', '.rar', '.7z', '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif'];
        const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!hasValidExtension) {
          console.error(`Invalid file type detected: ${fileName}`);
          return res.status(400).json({ 
            message: `Invalid file type. Supported formats are: ZIP, RAR, 7Z, PDF, and image files.`
          });
        }
        
        // Upload file to Google Drive
        const driveFile = await uploadToDrive(
          filePath,
          file.originalname,
          file.mimetype
        );

        if (driveFile) {
          // File was successfully uploaded to Google Drive
          const fileUrl = driveFile.webContentLink || driveFile.webViewLink;
          
          // Delete the local file since we now have it in Google Drive
          await deleteLocalFile(filePath);
          console.log(`Uploaded to Google Drive successfully: ${driveFile.id}`);
          
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
          console.error('Drive file upload returned null');
          return res.status(500).json({ 
            message: 'Failed to upload to Google Drive. Please try again.' 
          });
        }
      } catch (driveError) {
        console.error('Error uploading to Google Drive:', driveError);
        
        // Try to delete the local file if it exists to clean up
        try {
          if (fs.existsSync(filePath)) {
            await deleteLocalFile(filePath);
          }
        } catch (deleteError) {
          console.error('Error cleaning up local file:', deleteError);
        }
        
        return res.status(500).json({ 
          message: 'Error uploading to Google Drive',
          error: driveError.message
        });
      }
    } else {
      console.error('Invalid upload format detected');
      return res.status(400).json({ message: 'Invalid upload format. Please try again.' });
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