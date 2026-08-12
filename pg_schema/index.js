const { pgTable, serial, integer, varchar, numeric, date, timestamp } = require('drizzle-orm/pg-core');

const organizers = pgTable('organizers', {
  o_id: serial('o_id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  village: varchar('village', { length: 255 }),
  mandal: varchar('mandal', { length: 255 }),
  pincode: integer('pincode'),
  phone_number: varchar('phone_number', { length: 20 })
});

const growers = pgTable('growers', {
  g_id: serial('g_id').primaryKey(),
  o_id: integer('o_id').references(() => organizers.o_id),
  name: varchar('name', { length: 255 }).notNull(),
  village: varchar('village', { length: 255 }),
  mandal: varchar('mandal', { length: 255 }),
  pincode: integer('pincode'),
  phone_number: varchar('phone_number', { length: 20 })
});

const cropRegistrations = pgTable('crop_registrations', {
  c_id: serial('c_id').primaryKey(),
  g_id: integer('g_id').references(() => growers.g_id),
  crop_name: varchar('crop_name', { length: 255 }),
  crop_variety: varchar('crop_variety', { length: 255 }),
  acres: numeric('acres'),
  date_of_sowing: date('date_of_sowing'),
  date_of_planting: date('date_of_planting')
});

const locations = pgTable('locations', {
  l_id: serial('l_id').primaryKey(),
  address_line: varchar('address_line', { length: 255 }),
  village: varchar('village', { length: 255 }),
  mandal: varchar('mandal', { length: 255 }),
  state: varchar('state', { length: 255 }),
  pincode: integer('pincode')
});

const sdnHeaders = pgTable('sdn_headers', {
  sdn_number: integer('sdn_number').primaryKey(), // Manual entry from the paper form
  sdn_date: date('sdn_date'),
  from_location_id: integer('from_location_id').references(() => locations.l_id),
  to_location_id: integer('to_location_id').references(() => locations.l_id),
  supervisor_name: varchar('supervisor_name', { length: 255 }),
  truck_no: varchar('truck_no', { length: 50 }),
  lr_no: varchar('lr_no', { length: 100 }),
  freight_paid: numeric('freight_paid'),
  total_sdn_bags: integer('total_sdn_bags'),
  total_sdn_wt: numeric('total_sdn_wt')
});

const dryingBatches = pgTable('drying_batches', {
  lot_id: serial('lot_id').primaryKey(),
  l_id: integer('l_id').references(() => locations.l_id),
  total_input_wt: numeric('total_input_wt'),
  total_output_wt: numeric('total_output_wt'),
  loss_wt: numeric('loss_wt'),
  drying_date: timestamp('drying_date'),
  status: varchar('status', { length: 50 })
});

const sdnItems = pgTable('sdn_items', {
  item_id: serial('item_id').primaryKey(),
  sdn_number: integer('sdn_number').references(() => sdnHeaders.sdn_number),
  g_id: integer('g_id').references(() => growers.g_id),
  hybrid_code: integer('hybrid_code'), 
  d_id: integer('d_id').references(() => dryingBatches.lot_id),
  inward_lot_no: varchar('inward_lot_no', { length: 100 }),
  no_of_bags: integer('no_of_bags'),
  unit_weight: numeric('unit_weight'),
  qty_kgs: numeric('qty_kgs'),
  moisture_percentage: numeric('moisture_percentage'),
  harvest_date: date('harvest_date')
});

module.exports = {
  organizers,
  growers,
  cropRegistrations,
  locations,
  sdnHeaders,
  dryingBatches,
  sdnItems
};