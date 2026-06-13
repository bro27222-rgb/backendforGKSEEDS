const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto'); // Built-in Node tool, no install needed
const upload = require('./middleware/upload');
require('dotenv').config();

const Product = require('./models/Product');
const Label = require('./models/Label');
const User = require('./models/User');

const app = express();

// 1. SIMPLEST CORS FOR DEPLOYMENT
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("Database Connection Error:", err));

// --- API ROUTES ---

// Health Check (To see if it's alive)
app.get('/', (req, res) => res.send('Excel seeds Backend is LIVE'));

// LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user && user.password === password) {
      res.json({ success: true, message: "Login successful" });
    } else {
      res.status(401).json({ success: false, message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
// ADMIN: Generate Labels
// Changed to upload.none() because we are no longer sending a physical file
app.post('/api/admin/generate', upload.none(), async (req, res) => {
  try {
    const p = req.body;
    
    // CRITICAL FIX: Map frontend names to exactly what your DB Model expects
    const productToSave = {
      cropName: p.productName || p.cropName,
      packedVariety: p.variety || p.packedVariety,
      packedLotNumber: p.packedLotNumber,
      dateOfTesting: p.dateOfTesting,
      dateOfPackaging: p.packagingDate || p.dateOfPackaging,
      dateOfExpiry: p.dateOfExpiry,
      mrp: p.mrp,
      unitSalePrice: p.unitSalePrice,
      netQty: p.netQty,
      packedAt: p.packedAt,
      plantAddress: p.plantAddress,
      producedBy: p.producedBy,
      quantity: parseInt(p.quantity),
      // Grabs the hardcoded text string you added in the frontend
      leafletUrl: p.leaflet || "No Leaflet Provided" 
    };

    const newProduct = await Product.create(productToSave);

    const labelsToInsert = [];
    for (let i = 0; i < productToSave.quantity; i++) {
      const randomId = crypto.randomBytes(6).toString('hex').toUpperCase(); 
      labelsToInsert.push({ 
        _id: randomId, 
        productId: newProduct._id 
      });
    }

    const createdLabels = await Label.insertMany(labelsToInsert);
    res.status(201).json({ success: true, labelNumbers: createdLabels.map(l => l._id) });

  } catch (error) {
    console.error("GENERATE ERROR:", error);
    res.status(500).json({ error: "Server failed to save product." });
  }
});

// PUBLIC: Verify
app.get('/api/verify/:labelNo', async (req, res) => {
  try {
    const labelData = await Label.findById(req.params.labelNo).populate('productId');
    if (!labelData) return res.status(404).json({ message: "Invalid QR Code" });
    res.status(200).json({ labelNumber: labelData._id, ...labelData.productId._doc });
  } catch (error) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// DELETE PRODUCT & ASSOCIATED LABELS
app.delete('/api/admin/product/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    // 1. Delete the product
    await Product.findByIdAndDelete(productId);
    // 2. Delete all QR labels associated with it
    await Label.deleteMany({ productId: productId });
    
    res.json({ success: true, message: "Batch and labels deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete batch" });
  }
});
// EDIT PRODUCT DETAILS
app.put('/api/admin/product/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    // Updates the product with whatever new data is sent from the frontend modal
    await Product.findByIdAndUpdate(productId, req.body);
    res.json({ success: true, message: "Batch updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update batch" });
  }
});
app.get('/api/admin/stats', async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: "$dateOfPackaging", 
          // Removed $toInt to stop MongoDB from crashing on old/empty test data
          totalQuantity: { $sum: "$quantity" }, 
          products: { 
            $push: { 
              id: "$_id",         
              name: "$cropName", 
              variety: "$packedVariety", 
              qty: "$quantity",
              date: "$dateOfPackaging",
              mrp: "$mrp",
              usp: "$unitSalePrice",
              netQty: "$netQty"
            } 
          }
        }
      },
      { $sort: { "_id": -1 } }
    ]);
    res.json(stats);
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).json({ error: "Stats failed" });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));

module.exports = app;