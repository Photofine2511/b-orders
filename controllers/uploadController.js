const fs = require('fs');
const path = require('path');
const { 
  uploadToDrive, 
  getDriveClient, 
  deleteLocalFile 
} = require('../config/drive');
const Order = require('../models/orderModel');

// Cache to track upload status
const uploadCache = new Map(); // Map to track uploads by unique ID

/**
 * @desc    Upload large file to Google Drive using optimized approach
 * @route   POST /api/orders/upload-large-file-to-drive
 * @access  Private
 */
const uploadLargeFileToDrive = async (req, res) => {
  let filePath = null;
  
  try {
    // Check if Google Drive client is available first
    if (!getDriveClient()) {
      console.error('Google Drive client not available');
      return res.status(500).json({ 
        message: 'Google Drive storage is not available. Please try again later.' 
      });
    }

    // Capture upload ID from header if available (for tracking)
    const uploadId = req.headers['x-upload-id'] || `upload-${Date.now()}`;
    
    // Log detailed request info
    console.log(`Large file upload request: 
      - Upload ID: ${uploadId}
      - Files: ${req.files ? req.files.length : 0}
      - Content Length: ${req.headers['content-length'] || 'Not specified'} bytes
    `);
    
    // Get files from request
    const allFiles = req.files || [];
    
    if (allFiles.length === 0) {
      console.error('No files received in request');
      return res.status(400).json({ message: 'No files received. Please upload a file.' });
    }
    
    // We only handle single file uploads - use the first file
    const file = allFiles[0];
    filePath = file.path;
    
    // Track upload start time and file info
    uploadCache.set(uploadId, {
      status: 'uploading',
      startTime: Date.now(),
      fileName: file.originalname,
      filePath: filePath,
      fileSize: file.size,
      albumName: req.body.albumName || 'Untitled Album'
    });

    // Log detailed file info
    console.log(`Processing large file upload:
      - File name: ${file.originalname}
      - Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB
      - MIME type: ${file.mimetype}
      - Upload ID: ${uploadId}
    `);
    
    // For large files, we don't wait for the Google Drive upload to complete
    // Instead, we start the upload and return a quick response to prevent timeouts
    
    // Start Google Drive upload in the background
    (async () => {
      try {
        console.log(`Starting background upload to Google Drive: ${file.originalname}`);
        
        // Upload file to Google Drive
        const driveFile = await uploadToDrive(
          filePath,
          file.originalname,
          file.mimetype
        );

        if (driveFile) {
          // Update cache with success
          uploadCache.set(uploadId, {
            status: 'completed',
            driveFileId: driveFile.id,
            fileName: driveFile.name,
            fileSize: driveFile.size,
            fileUrl: driveFile.webContentLink || driveFile.webViewLink,
            completionTime: Date.now(),
            albumName: req.body.albumName || 'Untitled Album'
          });
          
          console.log(`Background upload completed successfully: ${driveFile.id}`);
          
          // Delete the local file since we now have it in Google Drive
          try {
            await deleteLocalFile(filePath);
            console.log(`Deleted local file: ${filePath}`);
          } catch (deleteError) {
            console.error(`Error deleting local file: ${deleteError.message}`);
          }
        } else {
          // Update cache with failure
          uploadCache.set(uploadId, {
            status: 'failed',
            error: 'Drive file upload returned null',
            fileName: file.originalname,
            completionTime: Date.now(),
            albumName: req.body.albumName || 'Untitled Album'
          });
          console.error('Drive file upload returned null');
        }
      } catch (uploadError) {
        // Update cache with error
        uploadCache.set(uploadId, {
          status: 'failed',
          error: uploadError.message || 'Unknown error during upload',
          fileName: file.originalname,
          completionTime: Date.now(),
          albumName: req.body.albumName || 'Untitled Album'
        });
        
        console.error(`Error in background upload: ${uploadError.message}`);
        
        // Try to clean up local file
        try {
          if (fs.existsSync(filePath)) {
            await deleteLocalFile(filePath);
          }
        } catch (deleteError) {
          console.error(`Error deleting local file: ${deleteError.message}`);
        }
      }
      
      // Clean up old cache entries (keep for 6 hours max)
      const cleanupTime = 6 * 60 * 60 * 1000; // 6 hours
      setTimeout(() => {
        if (uploadCache.has(uploadId)) {
          uploadCache.delete(uploadId);
          console.log(`Cleaned up upload cache for: ${uploadId}`);
        }
      }, cleanupTime);
    })().catch(bgError => {
      console.error(`Unhandled error in background upload: ${bgError.message}`);
    });
    
    // Immediately return a success response with tracking info
    return res.status(202).json({
      success: true,
      message: 'Large file upload accepted and processing',
      uploadId: uploadId,
      status: 'processing',
      fileName: file.originalname,
      fileSize: file.size
    });
    
  } catch (error) {
    console.error('Server error during large file upload:', error);
    
    // Clean up file if needed
    if (filePath && fs.existsSync(filePath)) {
      try {
        await deleteLocalFile(filePath);
      } catch (cleanupError) {
        console.error(`Error cleaning up file: ${cleanupError.message}`);
      }
    }
    
    res.status(500).json({ 
      message: 'Server error during file upload',
      error: error.message || 'Unknown server error'
    });
  }
};

/**
 * @desc    Check the status of a file upload by file name
 * @route   GET /api/orders/check-upload-status
 * @access  Private
 */
const checkUploadStatus = async (req, res) => {
  try {
    const { fileName, albumName } = req.query;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'File name is required to check upload status'
      });
    }
    
    console.log(`Checking upload status for: ${fileName}, Album: ${albumName || 'No album specified'}`);
    
    // First check the cache for recent uploads
    let foundInCache = false;
    let cacheResult = null;
    
    try {
      for (const [uploadId, uploadInfo] of uploadCache.entries()) {
        if (uploadInfo.fileName === fileName && 
            (!albumName || uploadInfo.albumName === albumName)) {
          foundInCache = true;
          cacheResult = uploadInfo;
          console.log(`Found upload in cache: ${uploadId}, Status: ${uploadInfo.status}`);
          break;
        }
      }
      
      if (foundInCache) {
        if (cacheResult.status === 'completed') {
          return res.status(200).json({
            success: true,
            message: 'Upload completed successfully',
            status: 'completed',
            fileInfo: {
              id: cacheResult.driveFileId,
              name: cacheResult.fileName,
              size: cacheResult.fileSize,
              url: cacheResult.fileUrl
            }
          });
        } else if (cacheResult.status === 'uploading' || cacheResult.status === 'processing') {
          return res.status(200).json({
            success: true,
            message: 'Upload still in progress',
            status: cacheResult.status
          });
        } else {
          // Failed status
          return res.status(404).json({
            success: false,
            message: 'Upload failed',
            error: cacheResult.error || 'Unknown error during upload'
          });
        }
      }
    } catch (cacheError) {
      console.error('Error checking upload cache:', cacheError);
      // Continue to check Google Drive directly
    }
    
    // If not in cache, check if a file exists with this name in Google Drive
    // This might happen if the server restarted after a successful upload
    console.log(`Checking Google Drive directly for file: ${fileName}`);
    
    try {
      const drive = getDriveClient();
      if (!drive) {
        return res.status(500).json({
          success: false,
          message: 'Google Drive service unavailable'
        });
      }
      
      // Search Google Drive for the file by name
      try {
        const response = await drive.files.list({
          q: `name = '${fileName}' and trashed = false`,
          fields: 'files(id, name, size, webContentLink, webViewLink)'
        });
        
        if (response.data.files && response.data.files.length > 0) {
          const driveFile = response.data.files[0];
          console.log(`Found file in Google Drive: ${driveFile.id}`);
          
          return res.status(200).json({
            success: true,
            message: 'File found in Google Drive',
            status: 'completed',
            fileInfo: {
              id: driveFile.id,
              name: driveFile.name,
              size: driveFile.size,
              url: driveFile.webContentLink || driveFile.webViewLink
            }
          });
        } else {
          console.log(`No file found in Google Drive with name: ${fileName}`);
        }
      } catch (driveSearchError) {
        console.error(`Error searching Google Drive: ${driveSearchError.message}`);
        return res.status(500).json({
          success: false,
          message: 'Error searching Google Drive',
          error: driveSearchError.message
        });
      }
    } catch (driveError) {
      console.error('Error accessing Google Drive client:', driveError);
      return res.status(500).json({
        success: false,
        message: 'Error accessing Google Drive service',
        error: driveError.message
      });
    }
    
    // If we get here, the file wasn't found anywhere
    return res.status(404).json({
      success: false,
      message: 'Upload not found or has failed',
      status: 'unknown'
    });
  } catch (error) {
    console.error('Error checking upload status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking upload status',
      error: error.message || 'Unknown server error'
    });
  }
};

// Clean up the upload cache periodically
setInterval(() => {
  const now = Date.now();
  const expiryTime = 6 * 60 * 60 * 1000; // 6 hours
  
  let cleanupCount = 0;
  for (const [uploadId, uploadInfo] of uploadCache.entries()) {
    const entryTime = uploadInfo.completionTime || uploadInfo.startTime || 0;
    if (now - entryTime > expiryTime) {
      uploadCache.delete(uploadId);
      cleanupCount++;
    }
  }
  
  if (cleanupCount > 0) {
    console.log(`Cleaned up ${cleanupCount} expired upload cache entries`);
  }
}, 30 * 60 * 1000); // Run every 30 minutes

module.exports = {
  uploadLargeFileToDrive,
  checkUploadStatus
}; 