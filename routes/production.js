const express = require('express');
const router = express.Router();
const { eq, ilike, or, isNull, isNotNull, inArray, and, desc, asc, sql, gte, lte } = require('drizzle-orm');



// 1. Import DB and Schemas
const { db } = require('../neonDb');
const { 
  locations, 
  organizers,
  growers, 
  cropRegistrations, 
  dryingBatches,
  sdnHeaders, 
  sdnItems 
} = require('../pg_schema/index');

// 2. Import our new Error Handler
const { handlePostgresError } = require('../utils/dbErrorHandler');

// ==========================================
// MASTER DATA CREATION ROUTES
// ==========================================


// POST: Create a new Organizer
router.post('/organizers', async (req, res) => {
  try {
    const newOrganizer = await db.insert(organizers).values(req.body).returning();
    res.json({ success: true, data: newOrganizer[0] });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// POST: Create a new Grower (Requires o_id to link to Organizer)
router.post('/growers', async (req, res) => {
  try {
    const newGrower = await db.insert(growers).values(req.body).returning();
    res.json({ success: true, data: newGrower[0] });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});






// GET: Fetch Organizers with Search & Pagination
router.get('/organizers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    // Search by Name OR Village
    let whereClause = undefined;
    if (search) {
      whereClause = or(
        ilike(organizers.name, `%${search}%`),
        ilike(organizers.village, `%${search}%`)
      );
    }

    const data = await db.select().from(organizers)
      .where(whereClause)
      .limit(limit)
      .offset(offset);
      
    res.json({ data, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// UPDATE ROUTES (PUT)
// ==========================================

// PUT: Update a Location
router.put('/locations/:id', async (req, res) => {
  try {
    const updated = await db.update(locations)
      .set(req.body)
      .where(eq(locations.l_id, parseInt(req.params.id)))
      .returning();
      
    res.json({ success: true, data: updated[0] });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// PUT: Update an Organizer
router.put('/organizers/:id', async (req, res) => {
  try {
    const updated = await db.update(organizers)
      .set(req.body)
      .where(eq(organizers.o_id, parseInt(req.params.id)))
      .returning();
      
    res.json({ success: true, data: updated[0] });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// PUT: Update a Grower
router.put('/growers/:id', async (req, res) => {
  try {
    const updated = await db.update(growers)
      .set(req.body)
      .where(eq(growers.g_id, parseInt(req.params.id)))
      .returning();
      
    res.json({ success: true, data: updated[0] });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});
// GET: Fetch Growers with Search, Pagination, and Organizer Name

// GET: Fetch Growers with Search, Pagination, Organizer Name, and Organizer Filter
router.get('/growers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const search = req.query.search || '';
    const o_id = req.query.o_id; // NEW: Check if an organizer ID was passed
    const offset = (page - 1) * limit;

    let conditions = [];
    
    if (search) {
      conditions.push(or(
        ilike(growers.name, `%${search}%`),
        ilike(growers.village, `%${search}%`),
        ilike(organizers.name, `%${search}%`)
      ));
    }

    if (o_id) {
      conditions.push(eq(growers.o_id, parseInt(o_id))); // Filter by Organizer
    }

    // Combine conditions using 'and' if both exist
    const finalWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db.select({
      g_id: growers.g_id,
      o_id: growers.o_id, // We need this to auto-fill the frontend!
      name: growers.name,
      village: growers.village,
      mandal: growers.mandal,
      phone_number: growers.phone_number,
      organizer_name: organizers.name
    })
    .from(growers)
    .leftJoin(organizers, eq(growers.o_id, organizers.o_id))
    .where(finalWhere)
    .limit(limit)
    .offset(offset);
      
    res.json({ data, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// DELETE: Organizer (with options to handle children/growers)
router.delete('/organizers/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const deleteChildren = req.query.deleteChildren === 'true'; 

    await db.transaction(async (tx) => {
      if (deleteChildren) {
        // Option 1: User chose to delete the Organizer AND all their Growers
        await tx.delete(growers).where(eq(growers.o_id, orgId));
      } else {
        // Option 2: User chose to KEEP the Growers. 
        // We set their o_id to null so they become "unassigned" growers.
        await tx.update(growers)
          .set({ o_id: null })
          .where(eq(growers.o_id, orgId));
      }

      // Finally, delete the Organizer
      await tx.delete(organizers).where(eq(organizers.o_id, orgId));
    });

    res.json({ success: true, message: "Organizer successfully deleted" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// DELETE: Grower
router.delete('/growers/:id', async (req, res) => {
  try {
    await db.delete(growers).where(eq(growers.g_id, parseInt(req.params.id)));
    res.json({ success: true, message: "Grower deleted" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// ==========================================
// CROP REGISTRATIONS CRUD
// ==========================================

// GET: Fetch Crop Registrations with Search & Pagination
router.get('/crop-registrations', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let whereClause = undefined;
    if (search) {
      whereClause = or(
        ilike(growers.name, `%${search}%`),
        ilike(cropRegistrations.crop_name, `%${search}%`),
        ilike(cropRegistrations.crop_variety, `%${search}%`)
      );
    }

    const data = await db.select({
      c_id: cropRegistrations.c_id,
      g_id: cropRegistrations.g_id,
      crop_name: cropRegistrations.crop_name,
      crop_variety: cropRegistrations.crop_variety,
      acres: cropRegistrations.acres,
      date_of_sowing: cropRegistrations.date_of_sowing,
      date_of_planting: cropRegistrations.date_of_planting,
      grower_name: growers.name,
      grower_village: growers.village,
      o_id: growers.o_id,              // NEW
      organizer_name: organizers.name  // NEW
    })
    .from(cropRegistrations)
    .innerJoin(growers, eq(cropRegistrations.g_id, growers.g_id))
    .leftJoin(organizers, eq(growers.o_id, organizers.o_id)) // Double join to get Organizer!
    .where(whereClause)
    .limit(limit)
    .offset(offset);
      
    res.json({ data, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Create
router.post('/crop-registrations', async (req, res) => {
  try {
    await db.insert(cropRegistrations).values(req.body);
    res.json({ success: true, message: "Crop registration created" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// PUT: Update
router.put('/crop-registrations/:id', async (req, res) => {
  try {
    await db.update(cropRegistrations)
      .set(req.body)
      .where(eq(cropRegistrations.c_id, parseInt(req.params.id)));
    res.json({ success: true, message: "Crop registration updated" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// DELETE
router.delete('/crop-registrations/:id', async (req, res) => {
  try {
    await db.delete(cropRegistrations)
      .where(eq(cropRegistrations.c_id, parseInt(req.params.id)));
    res.json({ success: true, message: "Crop registration deleted" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});


// ==========================================
// SDN (SEED DELIVERY NOTE) CRUD
// ==========================================
// GET ALL: Fetch SDN Headers for the List View (Searchable & Filterable by Date Range)
router.get('/sdn', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const search = req.query.search || '';
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const offset = (page - 1) * limit;

    let conditions = [];

    // 1. Text Search
    if (search) {
      conditions.push(or(
        ilike(sdnHeaders.truck_no, `%${search}%`),
        ilike(sdnHeaders.supervisor_name, `%${search}%`),
        ilike(sql`cast(${sdnHeaders.sdn_date} as text)`, `%${search}%`)
      ));
    }

    // 2. Date Range Filters
    if (fromDate) {
      conditions.push(gte(sdnHeaders.sdn_date, fromDate));
    }
    if (toDate) {
      conditions.push(lte(sdnHeaders.sdn_date, toDate));
    }

    // Combine all conditions safely
    const finalWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db.select()
      .from(sdnHeaders)
      .where(finalWhere)
      .orderBy(desc(sdnHeaders.sdn_date))
      .limit(limit)
      .offset(offset);
      
    res.json({ data, page, limit });
  } catch (err) {
    console.error("SDN Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET ONE: Fetch a single SDN Header AND its Items (For Editing/Viewing)
router.get('/sdn/:sdnNumber', async (req, res) => {
  try {
    const sdnNum = parseInt(req.params.sdnNumber);

    // 1. Fetch Header
    const header = await db.select().from(sdnHeaders).where(eq(sdnHeaders.sdn_number, sdnNum));
    if (header.length === 0) return res.status(404).json({ error: "SDN not found" });

    // 2. Fetch Items (Joining Growers to get the name for the UI)
    const items = await db.select({
      item_id: sdnItems.item_id,
      sdn_number: sdnItems.sdn_number,
      g_id: sdnItems.g_id,
      hybrid_code: sdnItems.hybrid_code,
      d_id: sdnItems.d_id,
      inward_lot_no: sdnItems.inward_lot_no,
      no_of_bags: sdnItems.no_of_bags,
      unit_weight: sdnItems.unit_weight,
      qty_kgs: sdnItems.qty_kgs,
      moisture_percentage: sdnItems.moisture_percentage,
      harvest_date: sdnItems.harvest_date,
      grower_name: growers.name
    })
    .from(sdnItems)
    .leftJoin(growers, eq(sdnItems.g_id, growers.g_id))
    .where(eq(sdnItems.sdn_number, sdnNum));

    res.json({ header: header[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Create SDN (Header + Items)
router.post('/sdn', async (req, res) => {
  const { header, items } = req.body;

  try {
    await db.transaction(async (tx) => {
      // 1. Insert Header
      await tx.insert(sdnHeaders).values(header);

      // 2. Insert Items (assigning the sdn_number to each)
      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
          sdn_number: header.sdn_number,
          g_id: item.g_id,
          hybrid_code: item.hybrid_code,
          d_id: item.d_id || null, // Nullable initially
          inward_lot_no: item.inward_lot_no,
          no_of_bags: item.no_of_bags,
          unit_weight: item.unit_weight,
          qty_kgs: item.qty_kgs,
          moisture_percentage: item.moisture_percentage,
          harvest_date: item.harvest_date ? new Date(item.harvest_date) : null
        }));
        await tx.insert(sdnItems).values(itemsToInsert);
      }
    });

    res.json({ success: true, message: "SDN successfully created!" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// PUT: Update SDN (Wipe & Replace strategy for items)
router.put('/sdn/:sdnNumber', async (req, res) => {
  const sdnNum = parseInt(req.params.sdnNumber);
  const { header, items } = req.body;

  try {
    await db.transaction(async (tx) => {
      // 1. Update Header
      await tx.update(sdnHeaders)
        .set(header)
        .where(eq(sdnHeaders.sdn_number, sdnNum));

      // 2. Delete existing items
      await tx.delete(sdnItems).where(eq(sdnItems.sdn_number, sdnNum));

      // 3. Insert fresh items
      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
          sdn_number: sdnNum,
          g_id: item.g_id,
          hybrid_code: item.hybrid_code,
          d_id: item.d_id || null,
          inward_lot_no: item.inward_lot_no,
          no_of_bags: item.no_of_bags,
          unit_weight: item.unit_weight,
          qty_kgs: item.qty_kgs,
          moisture_percentage: item.moisture_percentage,
          harvest_date: item.harvest_date ? new Date(item.harvest_date) : null
        }));
        await tx.insert(sdnItems).values(itemsToInsert);
      }
    });

    res.json({ success: true, message: "SDN successfully updated!" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// DELETE: Safely Delete SDN
router.delete('/sdn/:sdnNumber', async (req, res) => {
  const sdnNum = parseInt(req.params.sdnNumber);
  try {
    await db.transaction(async (tx) => {
      // Must delete items first due to foreign key constraints
      await tx.delete(sdnItems).where(eq(sdnItems.sdn_number, sdnNum));
      await tx.delete(sdnHeaders).where(eq(sdnHeaders.sdn_number, sdnNum));
    });
    res.json({ success: true, message: "SDN and all associated items deleted" });
  } catch (error) {
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message });
  }
});

// ==========================================
// 1. LOCATIONS CRUD
// ==========================================

router.get('/locations', async (req, res) => {
  try {
    const data = await db.select().from(locations).orderBy(asc(locations.l_id));
    res.json({ data });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

router.post('/locations', async (req, res) => {
  try {
    await db.insert(locations).values(req.body);
    res.json({ success: true, message: "Location created" });
  } catch (error) { 
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message }); 
  }
});

router.put('/locations/:id', async (req, res) => {
  try {
    await db.update(locations)
      .set(req.body)
      .where(eq(locations.l_id, parseInt(req.params.id)));
    res.json({ success: true, message: "Location updated" });
  } catch (error) { 
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message }); 
  }
});

router.delete('/locations/:id', async (req, res) => {
  try {
    await db.delete(locations).where(eq(locations.l_id, parseInt(req.params.id)));
    res.json({ success: true, message: "Location deleted" });
  } catch (error) { 
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message }); 
  }
});

// ==========================================
// DRYING OPERATIONS (Lazy-Loaded & SDN-Atomic)
// ==========================================

// A. GET UNDRIED SDNs (Paginated, Searchable, Grouped by Location)
router.get('/drying/undried/sdns', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30; // 30 SDNs per page
    const { search, fromDate, toDate } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [isNull(sdnItems.d_id)];

    if (search) {
      conditions.push(or(
        ilike(sdnHeaders.truck_no, `%${search}%`),
        ilike(sdnHeaders.supervisor_name, `%${search}%`),
        ilike(sql`cast(${sdnHeaders.sdn_number} as text)`, `%${search}%`)
      ));
    }
    if (fromDate) conditions.push(gte(sdnHeaders.sdn_date, fromDate));
    if (toDate) conditions.push(lte(sdnHeaders.sdn_date, toDate));

    // Fetch ONLY the SDN Headers that have undried items
    const data = await db.select({
      sdn_number: sdnHeaders.sdn_number,
      sdn_date: sdnHeaders.sdn_date,
      truck_no: sdnHeaders.truck_no,
      supervisor_name: sdnHeaders.supervisor_name,
      total_sdn_wt: sdnHeaders.total_sdn_wt,
      location_id: sdnHeaders.to_location_id,
      location_name: locations.village
    })
    .from(sdnHeaders)
    .innerJoin(sdnItems, eq(sdnHeaders.sdn_number, sdnItems.sdn_number))
    .leftJoin(locations, eq(sdnHeaders.to_location_id, locations.l_id))
    .where(and(...conditions))
    // Group By to ensure we only get 1 row per SDN, even if it has 50 items
    .groupBy(
      sdnHeaders.sdn_number, sdnHeaders.sdn_date, sdnHeaders.truck_no, 
      sdnHeaders.supervisor_name, sdnHeaders.total_sdn_wt, 
      sdnHeaders.to_location_id, locations.village
    )
    .orderBy(desc(sdnHeaders.sdn_date))
    .limit(limit)
    .offset(offset);

    // Count for pagination
    const countResult = await db.select({ count: sql`count(distinct ${sdnHeaders.sdn_number})` })
      .from(sdnHeaders)
      .innerJoin(sdnItems, eq(sdnHeaders.sdn_number, sdnItems.sdn_number))
      .where(and(...conditions));

    res.json({ data, page, limit, totalRecords: parseInt(countResult[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// B. GET ITEMS FOR A SPECIFIC SDN (Lazy Load Route)
router.get('/drying/items/:sdnNumber', async (req, res) => {
  try {
    const items = await db.select({
      item_id: sdnItems.item_id,
      hybrid_code: sdnItems.hybrid_code,
      inward_lot_no: sdnItems.inward_lot_no,
      no_of_bags: sdnItems.no_of_bags,
      qty_kgs: sdnItems.qty_kgs,
      grower_name: growers.name
    })
    .from(sdnItems)
    .leftJoin(growers, eq(sdnItems.g_id, growers.g_id))
    .where(eq(sdnItems.sdn_number, parseInt(req.params.sdnNumber)));

    res.json({ data: items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// C. CREATE NEW BATCH (Atomic SDN update - Fixed NaN Syntax Error)
// C. CREATE NEW BATCH 
router.post('/drying/batches', async (req, res) => {

  
  const { lot_id, l_id, sdn_numbers, total_input_wt } = req.body;
  try {
    await db.transaction(async (tx) => {
      
      // 1. SAFELY handle unassigned locations so it sends a valid SQL NULL instead of NaN
      const parsedLocId = (l_id && l_id !== 'unassigned') ? parseInt(l_id) : null;

      // 2. Insert Batch
      await tx.insert(dryingBatches).values({
        lot_id: parseInt(lot_id),
        l_id: parsedLocId,
        total_input_wt: total_input_wt,
        status: 'Processing',
        drying_date: new Date()
      });
      
      // 3. Ensure SDN numbers are strictly integers
      const sdnInts = sdn_numbers.map(num => parseInt(num));

      // 4. Assign Items
      await tx.update(sdnItems)
        .set({ d_id: parseInt(lot_id) })
        .where(inArray(sdnItems.sdn_number, sdnInts));
    });
    res.json({ success: true, message: "Batch created successfully" });
  } catch (error) { 
    console.error("Batch Creation Error:", error); 
    const { status, message } = handlePostgresError(error);
    res.status(status).json({ success: false, error: message }); 
  }
});

// D. GET ALL BATCHES (Filtered by Status)
router.get('/drying/batches', async (req, res) => {
  
  try {
    const { status, page = 1, limit = 15 } = req.query;
    const offset = (page - 1) * limit;

    let batchQuery = db.select({
      lot_id: dryingBatches.lot_id,
      l_id: dryingBatches.l_id,
      location_name: locations.village,
      total_input_wt: dryingBatches.total_input_wt,
      total_output_wt: dryingBatches.total_output_wt,
      loss_wt: dryingBatches.loss_wt,
      drying_date: dryingBatches.drying_date,
      status: dryingBatches.status
    })
    .from(dryingBatches)
    .leftJoin(locations, eq(dryingBatches.l_id, locations.l_id));

    if (status) batchQuery = batchQuery.where(eq(dryingBatches.status, status));

    const batches = await batchQuery.orderBy(desc(dryingBatches.drying_date)).limit(limit).offset(offset);

    if (batches.length === 0) return res.json({ batches: [], items: [], totalRecords: 0 });

    const batchIds = batches.map(b => b.lot_id);
    
    // Fetch items for these batches to build the nested view
    const items = await db.select({
      d_id: sdnItems.d_id,
      sdn_number: sdnItems.sdn_number,
      hybrid_code: sdnItems.hybrid_code,
      no_of_bags: sdnItems.no_of_bags,
      qty_kgs: sdnItems.qty_kgs,
      grower_name: growers.name,
      truck_no: sdnHeaders.truck_no
    })
    .from(sdnItems)
    .innerJoin(sdnHeaders, eq(sdnItems.sdn_number, sdnHeaders.sdn_number))
    .leftJoin(growers, eq(sdnItems.g_id, growers.g_id))
    .where(inArray(sdnItems.d_id, batchIds));

    let countQuery = db.select({ count: sql`count(*)` }).from(dryingBatches);
    if (status) countQuery = countQuery.where(eq(dryingBatches.status, status));
    const countResult = await countQuery;

    res.json({ batches, items, totalRecords: parseInt(countResult[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// E. COMPLETE BATCH
router.put('/drying/batches/:id/complete', async (req, res) => {
  try {
    await db.update(dryingBatches)
      .set({ total_output_wt: req.body.total_output_wt, loss_wt: req.body.loss_wt, status: 'Completed' })
      .where(eq(dryingBatches.lot_id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
module.exports = router;