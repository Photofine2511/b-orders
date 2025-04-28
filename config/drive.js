const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');

// Create local storage for temporary file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + fileExt);
  }
});

// Set up multer upload middleware
const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /zip|rar|7z|pdf|jpg|jpeg|png|webp|gif|bmp|tiff|tif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname || mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Invalid file type! Only ZIP, RAR, 7Z, PDF and image files (JPG, PNG, WEBP, GIF, etc.) are allowed');
    }
  }
});

// Initialize Google Drive API
const initGoogleDriveAPI = () => {
  try {
    // Check if all required environment variables are set
    const requiredEnvVars = [
      'GOOGLE_DRIVE_TYPE',
      'GOOGLE_DRIVE_PROJECT_ID',
      'GOOGLE_DRIVE_PRIVATE_KEY_ID',
      'GOOGLE_DRIVE_PRIVATE_KEY',
      'GOOGLE_DRIVE_CLIENT_EMAIL',
      'GOOGLE_DRIVE_CLIENT_ID',
      'GOOGLE_DRIVE_FOLDER_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.warn(`Missing Google Drive environment variables: ${missingVars.join(', ')}`);
      console.warn('Google Drive storage will not be available. Using local storage instead.');
      return null;
    }

    // Create credentials object from environment variables
    const credentials = {
      type: process.env.GOOGLE_DRIVE_TYPE,
      project_id: process.env.GOOGLE_DRIVE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_DRIVE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_DRIVE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.GOOGLE_DRIVE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.GOOGLE_DRIVE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.GOOGLE_DRIVE_CLIENT_X509_CERT_URL,
      universe_domain: process.env.GOOGLE_DRIVE_UNIVERSE_DOMAIN || 'googleapis.com'
    };

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    // Create and return the drive client
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Error initializing Google Drive API:', error);
    return null;
  }
};

// Initialize Google Drive client
let driveClient = null;

// Function to get or initialize Google Drive client
const getDriveClient = () => {
  if (!driveClient) {
    driveClient = initGoogleDriveAPI();
  }
  return driveClient;
};

// Upload a file to Google Drive
const uploadToDrive = async (filePath, fileName, mimeType) => {
  try {
    const drive = getDriveClient();
    
    // If Google Drive is not available, return null
    if (!drive) {
      console.warn('Google Drive client not available. File will remain in local storage.');
      return null;
    }

    // Create a readable stream from the file
    const fileStream = fs.createReadStream(filePath);
    
    // Set up the file metadata
    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] // Folder ID where files will be stored
    };
    
    // Set up the media
    const media = {
      mimeType: mimeType || 'application/octet-stream',
      body: fileStream
    };
    
    // Upload the file to Google Drive
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webContentLink,webViewLink,size'
    });
    
    console.log('File uploaded to Google Drive:', response.data);
    
    // Make the file publicly accessible for download
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    
    // Get updated file with download link
    const file = await drive.files.get({
      fileId: response.data.id,
      fields: 'id,name,webContentLink,webViewLink,size'
    });
    
    return file.data;
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw error;
  }
};

// Get a file from Google Drive
const getFileFromDrive = async (fileId) => {
  try {
    const drive = getDriveClient();
    
    if (!drive) {
      throw new Error('Google Drive client not available');
    }
    
    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id,name,webContentLink,webViewLink,size'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting file from Google Drive:', error);
    throw error;
  }
};

// Download a file from Google Drive
const downloadFromDrive = async (fileId, res) => {
  try {
    const drive = getDriveClient();
    
    if (!drive) {
      throw new Error('Google Drive client not available');
    }
    
    // Get file metadata to set the correct filename
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'name,mimeType'
    });
    
    // If res is provided, set headers and pipe response
    if (res) {
      // Set response headers
      res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.data.name}"`);
      res.setHeader('Content-Type', fileMetadata.data.mimeType || 'application/octet-stream');
      
      // Get the file content
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, { responseType: 'stream' });
      
      // Pipe the file stream to the response
      response.data.pipe(res);
      return;
    } else {
      // For cases where res is not provided, return the file data and metadata
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, { responseType: 'stream' });
      
      return {
        data: response.data,
        name: fileMetadata.data.name,
        mimeType: fileMetadata.data.mimeType
      };
    }
  } catch (error) {
    console.error('Error downloading from Google Drive:', error);
    throw error;
  }
};

// Delete a file from Google Drive
const deleteFromDrive = async (fileId) => {
  try {
    const drive = getDriveClient();
    
    if (!drive) {
      throw new Error('Google Drive client not available');
    }
    
    await drive.files.delete({
      fileId: fileId
    });
    
    return true;
  } catch (error) {
    console.error('Error deleting from Google Drive:', error);
    throw error;
  }
};

// Helper function to get a direct file download URL
const getFileDownloadUrl = (req, fileName, driveFileId = null) => {
  if (driveFileId) {
    // Return the API endpoint for downloading from Google Drive
    return `${req.protocol}://${req.get('host')}/api/orders/drive/${driveFileId}/download`;
  } else {
    // Fallback to local storage URL
    return `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
  }
};

// Helper function to delete a local file
const deleteLocalFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting local file:', err);
        return reject(err);
      }
      resolve(true);
    });
  });
};

module.exports = {
  upload,
  uploadToDrive,
  getFileFromDrive,
  downloadFromDrive,
  deleteFromDrive,
  getFileDownloadUrl,
  deleteLocalFile,
  getDriveClient
}; 