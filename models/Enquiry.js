// models/Enquiry.js
const mongoose = require('mongoose');

const EnquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false }, // Tracks the "New" WhatsApp style badge
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: '90d' // MAGIC: MongoDB will automatically delete this after 90 days
  }
});

module.exports = mongoose.model('Enquiry', EnquirySchema);