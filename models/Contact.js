const mongoose = require('mongoose');

const communicationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['email', 'phone', 'meeting', 'other'],
    default: 'other'
  },
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
  // Business-development categorization
  relationship: {
    type: String,
    enum: ['referral source', 'connector', 'both', 'none', 'unassessed'],
    default: 'unassessed'
  },
  likelihood: {
    type: String,
    enum: ['high', 'medium', 'low', 'unrated'],
    default: 'unrated'
  },
  relationshipComments: {
    type: String,
    default: ''
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
  dontSendEmail: {
    type: Boolean,
    default: false
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
contactSchema.index({ relationship: 1 });
contactSchema.index({ likelihood: 1 });
contactSchema.index({ followUpDate: 1 });

module.exports = mongoose.model('Contact', contactSchema);
