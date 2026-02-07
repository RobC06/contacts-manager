const mongoose = require('mongoose');

const clientNameSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('ClientName', clientNameSchema);
