const mongoose = require('mongoose');

const LotSequenceSchema = new mongoose.Schema({
  lotNumber: { type: String, required: true, unique: true },
  lastUsedNumber: { type: Number, required: true, default: 100000 }
});

module.exports = mongoose.model('LotSequence', LotSequenceSchema);