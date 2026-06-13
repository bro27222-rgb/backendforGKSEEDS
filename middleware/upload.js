const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Connect your keys
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure the storage folder
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'seed_leaflets', // Files will go in this folder in Cloudinary
    resource_type: 'raw',   // Important: 'raw' is required for PDF files
    format: 'pdf'
  },
});

const upload = multer({ storage });

module.exports = upload;