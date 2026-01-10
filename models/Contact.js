const mongoose = require('mongoose');

const communicationSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
}, { _id: true });

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: String,
    default: '',
    trim: true
  },
  title: {
    type: String,
    default: '',
    trim: true
  },
  email: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  comments: {
    type: String,
    default: ''
  },
  tag: {
    type: String,
    enum: ['follow up', 'waiting for response', 'no action'],
    default: 'no action'
  },
  followUpDate: {
    type: String,
    default: null
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpNotes: {
    type: String,
    default: ''
  },
  communications: [communicationSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster searches
contactSchema.index({ name: 'text', company: 'text', title: 'text' });
contactSchema.index({ tag: 1 });
contactSchema.index({ followUpDate: 1 });

module.exports = mongoose.model('Contact', contactSchema);
