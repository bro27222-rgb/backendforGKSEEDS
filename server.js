const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken'); // Added JWT
const upload = require('./middleware/upload');
require('dotenv').config();

const productionRoutes = require('./routes/production');
const dryingRoutes = require('./routes/drying');



// Add this at the top with your other models
const Enquiry = require('./models/Enquiry');

const Product = require('./models/Product');
const Label = require('./models/Label');
const User = require('./models/User');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("Database Connection Error:", err));

app.get('/', (req, res) => res.send('srivishnu seeds Backend is LIVE'));

// --- NEW SECURITY BOUNCER (MIDDLEWARE) ---
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Check if a token was sent
  if (!authHeader) return res.status(403).json({ error: "Access Denied: No token provided" });
  
  const token = authHeader.split(' ')[1]; // Extract token from "Bearer <token>"
  
  // Verify the token is real and hasn't been tampered with
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Access Denied: Invalid token" });
    req.user = decoded; // Token is good, let them pass
    next();
  });
};

// --- API ROUTES ---

// LOGIN: Now creates and hands out a secure token
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user && user.password === password) {
      // Create a secure badge that lasts for 8 hours
      const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
      res.json({ success: true, token: token, message: "Login successful" });
    } else {
      res.status(401).json({ success: false, message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// PUBLIC VERIFY ROUTE: No security needed here so anyone can scan a QR code
app.get('/api/verify/:labelNo', async (req, res) => {
  try {
    const labelData = await Label.findById(req.params.labelNo).populate('productId');
    if (!labelData) return res.status(404).json({ message: "Invalid QR Code" });
    res.status(200).json({ labelNumber: labelData._id, ...labelData.productId._doc });
  } catch (error) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ADMIN ROUTES: Notice the added 'verifyToken' before the async function!
app.post('/api/admin/generate', verifyToken, upload.none(), async (req, res) => {
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

    const newProduct = await Product.create(productToSave);

    const labelsToInsert = [];
    for (let i = 0; i < productToSave.quantity; i++) {
      const randomId = crypto.randomBytes(6).toString('hex').toUpperCase(); 
      labelsToInsert.push({ _id: randomId, productId: newProduct._id });
    }

    const createdLabels = await Label.insertMany(labelsToInsert);
    res.status(201).json({ success: true, labelNumbers: createdLabels.map(l => l._id) });

  } catch (error) {
    res.status(500).json({ error: "Server failed to save product." });
  }
});

app.delete('/api/admin/product/:id', verifyToken, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    await Label.deleteMany({ productId: req.params.id });
    res.json({ success: true, message: "Batch and labels deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete batch" });
  }
});

app.put('/api/admin/product/:id', verifyToken, async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Batch updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update batch" });
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
    res.status(500).json({ error: "Stats failed" });
  }
});


// ── PUBLIC ROUTE: Submit Enquiry ──
app.post('/api/enquiry', async (req, res) => {
  try {
    await Enquiry.create(req.body);
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit enquiry" });
  }
});

// ── ADMIN ROUTES: Manage Enquiries ──
app.get('/api/admin/enquiries', verifyToken, async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 });
    res.json(enquiries);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch enquiries" });
  }
});

app.get('/api/admin/enquiries/unread-count', verifyToken, async (req, res) => {
  try {
    const count = await Enquiry.countDocuments({ isRead: false });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch count" });
  }
});

app.put('/api/admin/enquiries/:id/read', verifyToken, async (req, res) => {
  try {
    await Enquiry.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete('/api/admin/enquiries/:id', verifyToken, async (req, res) => {
  try {
    await Enquiry.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// postgres work

app.get('/api/admin/test-postgres', async (req, res) => {
  try {
    // 1. Insert a test location into Neon
    await db.insert(locations).values({
      address_line: "Malleshwar cold storage",
      village: "Erumadla",
      mandal: "Warangal",
      state: "Telangana",
      pincode: 506001
    });

    // 2. Fetch all locations from Neon
    const allLocations = await db.select().from(locations);

    // 3. Send the result to the browser
    res.json({
      success: true,
      message: "PostgreSQL is working perfectly!",
      data: allLocations
    });
  } catch (error) {
    console.error("Neon DB Error:", error);
    res.status(500).json({ error: error.message });
  }
});



app.use('/api', productionRoutes);
app.use('/api/drying', dryingRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));

module.exports = app;