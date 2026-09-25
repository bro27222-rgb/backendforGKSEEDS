const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const upload = require('./middleware/upload');
require('dotenv').config();

const Enquiry = require('./models/Enquiry');
const Product = require('./models/Product');
const Label = require('./models/Label');
const User = require('./models/User');
const LotSequence = require('./models/LotSequence'); // Added the new sequence tracker

const app = express();

app.use(cors());
app.use(express.json());

// --- VERCEL SERVERLESS DB CONNECTION FIX WITH LOGS ---
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000
      });
    } catch (err) {
      console.error("[DB Check] CRITICAL: Database Connection Error:", err);
      return res.status(503).json({ 
        success: false, 
        error: "Service Unavailable: Database connection failed. Please check MongoDB Atlas." 
      });
    }
  }
  next();
});

app.get('/', (req, res) => {
  res.send('GangaKaveri seeds Backend is LIVE');
});

// --- SECURITY BOUNCER (MIDDLEWARE) ---
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(403).json({ 
      success: false, 
      error: "Access Denied: No authentication token provided." 
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ 
        success: false, 
        error: "Access Denied: Your session has expired or the token is invalid. Please log in again." 
      });
    }
    req.user = decoded;
    next();
  });
};

// --- API ROUTES ---

// LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user && user.password === password) {
      const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
      res.json({ success: true, token: token, message: "Login successful" });
    } else {
      res.status(401).json({ success: false, error: "Invalid email or password" });
    }
  } catch (error) {
    console.error("[Login] CRITICAL ERROR:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: Unable to process login. Please check database connectivity." 
    });
  }
});

// PUBLIC VERIFY ROUTE
app.get('/api/verify/:labelNo', async (req, res) => {
  try {
    const labelData = await Label.findById(req.params.labelNo).populate('productId');
    if (!labelData) {
      return res.status(404).json({ success: false, error: "Invalid QR Code: Product not found." });
    }
    res.status(200).json({ labelNumber: labelData._id, ...labelData.productId._doc });
  } catch (error) {
    console.error("[Verify] CRITICAL ERROR:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: Failed to verify product details." 
    });
  }
});

// ADMIN GENERATE ROUTE
app.post('/api/admin/generate', verifyToken, upload.none(), async (req, res) => {
  try {
    const p = req.body;
    const quantityToGenerate = parseInt(p.quantity);
    
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
      quantity: quantityToGenerate,
      leafletUrl: p.leaflet || "No Leaflet Provided" 
    };

    console.log("[Admin Generate] Creating product document in MongoDB...");
    const newProduct = await Product.create(productToSave);
    
    // --- NEW: Sequential Lot Number Tracking Logic ---
    console.log(`[Admin Generate] Fetching sequence data for Lot Number: ${productToSave.packedLotNumber}...`);
    let sequenceDoc = await LotSequence.findOne({ lotNumber: productToSave.packedLotNumber });
    
    let currentNumber = 100000; // Base starting point
    if (sequenceDoc) {
      currentNumber = sequenceDoc.lastUsedNumber;
      console.log(`[Admin Generate] Existing lot found. Resuming sequence from: ${currentNumber}`);
    } else {
      console.log(`[Admin Generate] Brand new lot. Starting sequence at 100000.`);
    }

    const labelsToInsert = [];
    for (let i = 0; i < quantityToGenerate; i++) {
      currentNumber++; // Increment safely
      labelsToInsert.push({ _id: currentNumber.toString(), productId: newProduct._id });
    }

    // Save the new highest number back to the tracker
    await LotSequence.updateOne(
      { lotNumber: productToSave.packedLotNumber },
      { $set: { lastUsedNumber: currentNumber } },
      { upsert: true } // Creates the document if it didn't exist
    );
    console.log(`[Admin Generate] Updated sequence tracker. Next label for this lot will start after ${currentNumber}.`);

    console.log("[Admin Generate] Inserting sequential labels into database...");
    const createdLabels = await Label.insertMany(labelsToInsert);

    res.status(201).json({ success: true, labelNumbers: createdLabels.map(l => l._id) });

  } catch (error) {
    console.error("[Admin Generate] CRITICAL ERROR FAILED TO SAVE:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: Failed to save batch to the database. Check data formats." 
    });
  }
});

app.delete('/api/admin/product/:id', verifyToken, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Label.deleteMany({ productId: req.params.id });
    res.json({ success: true, message: "Batch and labels deleted successfully." });
  } catch (error) {
    console.error("[Admin Delete] CRITICAL ERROR:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: Failed to delete the batch from the database." 
    });
  }
});

app.put('/api/admin/product/:id', verifyToken, async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Batch updated successfully." });
  } catch (error) {
    console.error("[Admin Update] CRITICAL ERROR:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: Failed to update the batch in the database." 
    });
  }
});

app.get('/api/admin/stats', verifyToken, async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: "$dateOfPackaging", 
          totalQuantity: { $sum: "$quantity" }, 
          products: { 
            $push: { 
              id: "$_id", name: "$cropName", variety: "$packedVariety", 
              qty: "$quantity", date: "$dateOfPackaging", mrp: "$mrp",
              usp: "$unitSalePrice", netQty: "$netQty"
            } 
          }
        }
      },
      { $sort: { "_id": -1 } }
    ]);
    res.json(stats);
  } catch (error) {
    console.error("[Admin Stats] CRITICAL ERROR:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: Failed to fetch production statistics." 
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));

module.exports = app;