const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    albumName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: false,
    },
    serverFilename: {
      type: String,
      default: null,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Acknowledged', 'Printing', 'Completed'],
      default: 'Pending',
    },
    pageType: {
      type: String,
      required: true,
      enum: ['Regular', 'NT-Slim', 'NT-Thick'],
    },
    lamination: {
      type: String,
      required: true,
      enum: ['Matte', 'Glossy', 'Velvet', 'Texture', 'None'],
    },
    transparent: {
      type: Boolean,
      default: false,
    },
    emboss: {
      type: Boolean,
      default: false,
    },
    miniBook: {
      type: Boolean,
      default: false,
    },
    coverType: {
      type: String,
      required: true,
      enum: ['Matte', 'Glossy', 'Velvet', 'Texture', 'Sparkle'],
    },
    adminNotes: {
      type: String,
      default: '',
    },
    storageProvider: {
      type: String,
      enum: ['cloudinary', 'local', 'google_drive'],
      default: 'local',
    },
    driveFileId: {
      type: String,
      default: null,
    },
    driveFileLink: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order; 