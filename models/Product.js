const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  // The Basics
  cropName: { type: String, required: true },       
  packedVariety: { type: String, required: true },  
  packedLotNumber: { type: String, required: true },

  // Dates
  dateOfTesting: { type: String, required: true },
  dateOfPackaging: { type: String, required: true },
  dateOfExpiry: { type: String, required: true },

  // Pricing and Weight
  mrp: { type: String, required: true },            
  unitSalePrice: { type: String, required: true },  
  netQty: { type: String, required: true },         

  // Location and Manufacturer
  packedAt: { type: String, required: true },       
  plantAddress: { type: String, required: true },   
  producedBy: { type: String, required: true },     

  // The PDF link from Cloudinary
  leafletUrl: { type: String, required: true },

  // THIS IS REQUIRED to prevent Mongoose from dropping the data
  quantity: { type: Number, required: true },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', ProductSchema);