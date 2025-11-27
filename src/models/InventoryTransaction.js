const mongoose = require('mongoose');

const InventoryTransactionSchema = new mongoose.Schema({
  inventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: true
  },
  transactionType: {
    type: String,
    enum: ['add', 'reduce', 'room_allocation', 'room_refill', 'adjustment'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousStock: {
    type: Number,
    required: true
  },
  newStock: {
    type: Number,
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: String,
  isAutomatic: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.models.InventoryTransaction || mongoose.model('InventoryTransaction', InventoryTransactionSchema);