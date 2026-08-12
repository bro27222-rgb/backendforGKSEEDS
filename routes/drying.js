const express = require('express');
const router = express.Router();
const { eq, isNull, inArray } = require('drizzle-orm');

const { db } = require('../neonDb');
const { dryingBatches, sdnItems, sdnHeaders } = require('../pg_schema/index');
const { handlePostgresError } = require('../utils/dbErrorHandler');

// ==========================================
// 1. GET: Fetch all SDNs waiting to be dried
// ==========================================
router.get('/pending-sdns', async (req, res) => {
  try {
    // Fetch unique SDN Headers where at least one of their items has NO drying batch (d_id is null)
    const pendingSDNs = await db
      .selectDistinct({
        sdn_number: sdnHeaders.sdn_number,
        sdn_date: sdnHeaders.sdn_date,
        truck_no: sdnHeaders.truck_no,
        total_sdn_bags: sdnHeaders.total_sdn_bags,
        total_sdn_wt: sdnHeaders.total_sdn_wt
      })
      .from(sdnHeaders)
      .innerJoin(sdnItems, eq(sdnHeaders.sdn_number, sdnItems.sdn_number))
      .where(isNull(sdnItems.d_id));

    res.json(pendingSDNs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. POST: Create a new Drying Batch
// ==========================================
router.post('/start-batch', async (req, res) => {
  // sdnNumbers is now an array of Truck SDNs from the frontend, e.g., [197, 198]
  const { l_id, total_input_wt, drying_date, sdnNumbers } = req.body;

  try {
    await db.transaction(async (tx) => {
      // Step A: Create the new Drying Batch
      const newBatch = await tx.insert(dryingBatches).values({
        l_id: l_id,
        total_input_wt: total_input_wt,
        drying_date: new Date(drying_date),
        status: 'In Progress'
      }).returning(); 

      const generatedLotId = newBatch[0].lot_id;

      // Step B: Assign this lot_id to EVERY item that belongs to the selected SDNs
      if (sdnNumbers && sdnNumbers.length > 0) {
        await tx.update(sdnItems)
          .set({ d_id: generatedLotId })
          .where(inArray(sdnItems.sdn_number, sdnNumbers));
      }
    });

    res.json({ success: true, message: "Drying batch successfully started for selected SDNs!" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// ==========================================
// 3. PUT: Complete a Drying Batch
// ==========================================
router.put('/complete-batch/:lotId', async (req, res) => {
  const lotId = parseInt(req.params.lotId);
  const { total_output_wt } = req.body; 

  try {
    await db.transaction(async (tx) => {
      const batchData = await tx.select().from(dryingBatches).where(eq(dryingBatches.lot_id, lotId));
      
      if (batchData.length === 0) throw new Error("Batch not found");
      
      const inputWt = parseFloat(batchData[0].total_input_wt);
      const outputWt = parseFloat(total_output_wt);
      
      const lossWt = inputWt - outputWt;

      await tx.update(dryingBatches)
        .set({
          total_output_wt: outputWt,
          loss_wt: lossWt,
          status: 'Completed'
        })
        .where(eq(dryingBatches.lot_id, lotId));
    });

    res.json({ success: true, message: "Drying batch completed!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// STANDARD CRUD FOR DRYING BATCHES
// ==========================================

// GET: Fetch ALL Drying Batches
router.get('/batches', async (req, res) => {
  try {
    const batches = await db.select().from(dryingBatches);
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Fetch a SINGLE Drying Batch by Lot ID
router.get('/batches/:lotId', async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);
    const batch = await db.select().from(dryingBatches).where(eq(dryingBatches.lot_id, lotId));
    
    if (batch.length === 0) {
      return res.status(404).json({ error: "Drying batch not found" });
    }
    
    // Optional: Fetch the SDNs associated with this batch to show on the frontend
    const associatedItems = await db.selectDistinct({ sdn_number: sdnItems.sdn_number })
                                    .from(sdnItems)
                                    .where(eq(sdnItems.d_id, lotId));

    res.json({
      ...batch[0],
      assigned_sdns: associatedItems.map(item => item.sdn_number)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT: Generic Update for a Drying Batch (Fixing mistakes)
router.put('/batches/:lotId', async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);
    
    // Format dates if they are included in the update payload
    if (req.body.drying_date) {
      req.body.drying_date = new Date(req.body.drying_date);
    }

    const updatedBatch = await db.update(dryingBatches)
      .set(req.body)
      .where(eq(dryingBatches.lot_id, lotId))
      .returning();

    res.json({ success: true, data: updatedBatch[0] });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// DELETE: Safely Delete a Drying Batch
router.delete('/batches/:lotId', async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);

    await db.transaction(async (tx) => {
      // Step A: Un-assign the batch from all SDN Items so we don't get a Foreign Key error
      await tx.update(sdnItems)
        .set({ d_id: null })
        .where(eq(sdnItems.d_id, lotId));

      // Step B: Now that no items rely on it, delete the batch itself
      await tx.delete(dryingBatches)
        .where(eq(dryingBatches.lot_id, lotId));
    });

    res.json({ success: true, message: "Drying batch safely deleted and SDNs unassigned." });
  } catch (error) {
    console.error("Delete Failed:", error);
    res.status(500).json({ success: false, error: "Failed to delete batch." });
  }
});

module.exports = router;