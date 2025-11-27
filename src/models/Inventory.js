const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  category: { 
    type: String, 
    enum: ['Housekeeping', 'Pantry', 'Minibar', 'Kitchen', 'Laundry', 'Maintenance'],
    required: true
  },
  unitType: { 
    type: String, 
    enum: ['pcs', 'pack', 'bottle', 'litre', 'kg', 'gram', 'meter', 'roll', 'box', 'set'],
    required: true 
  },
  currentStock: { 
    type: Number, 
    required: true,
    min: 0
  },
  minThreshold: { 
    type: Number, 
    required: true,
    min: 0
  },
  reorderQuantity: { 
    type: Number, 
    required: true,
    min: 1
  },
  costPerUnit: { 
    type: Number, 
    required: true,
    min: 0
  },
  supplier: {
    name: { type: String, required: true },
    contactPerson: { type: String },
    phone: { type: String },
    email: { type: String },
    address: { type: String },
    gstNumber: { type: String }
  },
  storageLocation: { 
    type: String,
    required: true,
    default: 'Main Storage'
  },
  notes: { 
    type: String 
  },
  isLowStock: { 
    type: Boolean, 
    default: false 
  },
  lastRestockDate: { 
    type: Date 
  }
}, { timestamps: true });

// Virtual for checking if reordering is needed
InventorySchema.virtual('needsReorder').get(function() {
  return this.currentStock <= this.minThreshold;
});

// Pre-save hook to update isLowStock flag
InventorySchema.pre('save', function(next) {
  this.isLowStock = this.currentStock <= this.minThreshold;
  next();
});

module.exports = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema);