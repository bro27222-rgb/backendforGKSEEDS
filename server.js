const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const upload = require('./middleware/upload');
require('dotenv').config();

const Enquiry = require('./models/Enquiry');
const Product = require('./models/Product');
const Label = require('./models/Label');
const User = require('./models/User');

const app = express();

app.use(cors());
app.use(express.json());

// --- VERCEL SERVERLESS DB CONNECTION FIX WITH LOGS ---
app.use(async (req, res, next) => {
  console.log(`[DB Check] Incoming request to: ${req.method} ${req.url}`);
  if (mongoose.connection.readyState !== 1) {
    console.log("[DB Check] Connection is disconnected. Reconnecting to MongoDB Atlas...");
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000
      });
      console.log("[DB Check] Successfully re-connected to MongoDB Atlas");
    } catch (err) {
      console.error("[DB Check] CRITICAL: Database Connection Error:", err);
      return res.status(500).json({ error: "Database connection failed" });
    }
  } else {
    console.log("[DB Check] Database connection is active.");
  }
  next();
});

app.get('/', (req, res) => {
  console.log("[Route] Root endpoint hit");
  res.send('GangaKaveri seeds Backend is LIVE');
});

// --- SECURITY BOUNCER (MIDDLEWARE) ---
const verifyToken = (req, res, next) => {
  console.log("[Auth Middleware] Checking token for route:", req.originalUrl);
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    console.log("[Auth Middleware] Rejected: No authorization header found");
    return res.status(403).json({ error: "Access Denied: No token provided" });
  }
  
  const token = authHeader.split(' ')[1];
  console.log("[Auth Middleware] Token extracted, verifying with JWT_SECRET...");
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("[Auth Middleware] Rejected: Invalid token ->", err.message);
      return res.status(401).json({ error: "Access Denied: Invalid token" });
    }
    console.log("[Auth Middleware] Token verified successfully for user:", decoded.email);
    req.user = decoded;
    next();
  });
};

// --- API ROUTES ---

// LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  console.log("[Login] Attempt received for email:", req.body.email);
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      console.log("[Login] User found in database:", user.email);
      if (user.password === password) {
        console.log("[Login] Password matches. Generating token...");
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
        console.log("[Login] Token generated successfully. Sending response.");
        res.json({ success: true, token: token, message: "Login successful" });
      } else {
        console.log("[Login] Failed: Password mismatch");
        res.status(401).json({ success: false, message: "Invalid email or password" });
      }
    } else {
      console.log("[Login] Failed: User not found in database");
      res.status(401).json({ success: false, message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("[Login] CRITICAL ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUBLIC VERIFY ROUTE
app.get('/api/verify/:labelNo', async (req, res) => {
  console.log("[Verify] Searching for label number:", req.params.labelNo);
  try {
    const labelData = await Label.findById(req.params.labelNo).populate('productId');
    if (!labelData) {
      console.log("[Verify] Label not found in database");
      return res.status(404).json({ message: "Invalid QR Code" });
    }
    console.log("[Verify] Label found, returning product details");
    res.status(200).json({ labelNumber: labelData._id, ...labelData.productId._doc });
  } catch (error) {
    console.error("[Verify] CRITICAL ERROR:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ADMIN GENERATE ROUTE
app.post('/api/admin/generate', verifyToken, upload.none(), async (req, res) => {
  console.log("[Admin Generate] Request received. Body data:", req.body);
  try {
    const p = req.body;
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
      leafletUrl: p.leaflet || "No Leaflet Provided" 
    };

    console.log("[Admin Generate] Creating product document in MongoDB...");
    const newProduct = await Product.create(productToSave);
    console.log("[Admin Generate] Product created with ID:", newProduct._id);

    const labelsToInsert = [];
    console.log(`[Admin Generate] Generating ${productToSave.quantity} random label IDs...`);
    for (let i = 0; i < productToSave.quantity; i++) {
      const randomId = crypto.randomBytes(6).toString('hex').toUpperCase(); 
      labelsToInsert.push({ _id: randomId, productId: newProduct._id });
    }

    console.log("[Admin Generate] Inserting labels into database...");
    const createdLabels = await Label.insertMany(labelsToInsert);
    console.log(`[Admin Generate] Successfully created ${createdLabels.length} labels.`);

    res.status(201).json({ success: true, labelNumbers: createdLabels.map(l => l._id) });

  } catch (error) {
    console.error("[Admin Generate] CRITICAL ERROR FAILED TO SAVE:", error);
    res.status(500).json({ error: "Server failed to save product." });
  }
});

app.delete('/api/admin/product/:id', verifyToken, async (req, res) => {
  console.log("[Admin Delete] Request to delete product ID:", req.params.id);
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Label.deleteMany({ productId: req.params.id });
    console.log("[Admin Delete] Batch and labels successfully deleted.");
    res.json({ success: true, message: "Batch and labels deleted" });
  } catch (error) {
    console.error("[Admin Delete] CRITICAL ERROR:", error);
    res.status(500).json({ error: "Failed to delete batch" });
  }
});

app.put('/api/admin/product/:id', verifyToken, async (req, res) => {
  console.log("[Admin Update] Request to update product ID:", req.params.id);
  try {
    await Product.findByIdAndUpdate(req.params.id, req.body);
    console.log("[Admin Update] Batch updated successfully.");
    res.json({ success: true, message: "Batch updated successfully" });
  } catch (error) {
    console.error("[Admin Update] CRITICAL ERROR:", error);
    res.status(500).json({ error: "Failed to update batch" });
  }
});

app.get('/api/admin/stats', verifyToken, async (req, res) => {
  console.log("[Admin Stats] Fetching production stats aggregation...");
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
    console.log("[Admin Stats] Stats compiled successfully. Total groups:", stats.length);
    res.json(stats);
  } catch (error) {
    console.error("[Admin Stats] CRITICAL ERROR:", error);
    res.status(500).json({ error: "Stats failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));

module.exports = app;