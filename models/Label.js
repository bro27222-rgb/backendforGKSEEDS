const mongoose = require('mongoose');

const LabelSchema = new mongoose.Schema({
  // This is the unique "Label Number" (e.g., A02600473083)
  _id: { type: String, required: true }, 

  // This links this specific bag to the Product batch details
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  }
});

module.exports = mongoose.model('Label', LabelSchema);