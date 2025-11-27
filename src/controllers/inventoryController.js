const Inventory = require('../models/Inventory');
const InventoryTransaction = require('../models/InventoryTransaction');
const RoomInventoryChecklist = require('../models/RoomInventoryChecklist');

// Get all inventory items with low stock alerts
exports.getItems = async (req, res) => {
  try {
    const items = await Inventory.find()
      .sort({ name: 1 });
    
    // Add alert flags
    const itemsWithAlerts = items.map(item => ({
      ...item.toObject(),
      isOutOfStock: item.currentStock === 0,
      needsReorder: item.currentStock <= item.minThreshold
    }));
    
    res.json(itemsWithAlerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create inventory item
exports.createItem = async (req, res) => {
  try {
    const item = new Inventory(req.body);
    item.isLowStock = item.currentStock <= item.minThreshold;
    await item.save();
    
    // Create initial transaction
    const transaction = new InventoryTransaction({
      inventoryId: item._id,
      transactionType: 'add',
      quantity: item.currentStock,
      previousStock: 0,
      newStock: item.currentStock,
      userId: req.user.id,
      notes: 'Initial stock entry'
    });
    await transaction.save();
    
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update inventory item
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Inventory.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete inventory item
exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Inventory.findByIdAndDelete(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all transactions
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await InventoryTransaction.find()
      .populate('inventoryId', 'name')
      .populate('userId', 'username')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create transaction (role-based permissions)
exports.createTransaction = async (req, res) => {
  try {
    const { inventoryId, transactionType, quantity, notes, roomId } = req.body;
    
    // Check permissions - housekeeping cannot modify stock manually
    if (req.user.role === 'housekeeping' && !['room_allocation', 'room_refill'].includes(transactionType)) {
      return res.status(403).json({ error: 'Insufficient permissions for manual stock modification' });
    }
    
    const item = await Inventory.findById(inventoryId);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    const previousStock = item.currentStock;
    let newStock;
    
    // Calculate new stock
    if (transactionType === 'add') {
      newStock = previousStock + parseInt(quantity);
      item.lastRestockDate = new Date();
    } else if (['reduce', 'room_allocation'].includes(transactionType)) {
      newStock = Math.max(0, previousStock - parseInt(quantity));
    } else if (transactionType === 'room_refill') {
      newStock = previousStock + parseInt(quantity);
    } else if (transactionType === 'adjustment') {
      newStock = parseInt(quantity);
    }
    
    // Validate sufficient stock for reduction
    if (newStock < 0) {
      return res.status(400).json({ error: 'Insufficient stock available' });
    }
    
    const transaction = new InventoryTransaction({
      inventoryId,
      transactionType,
      quantity: Math.abs(quantity),
      previousStock,
      newStock,
      userId: req.user.id,
      roomId,
      notes,
      isAutomatic: ['room_allocation', 'room_refill'].includes(transactionType)
    });
    
    await transaction.save();
    
    // Update inventory
    item.currentStock = newStock;
    item.isLowStock = newStock <= item.minThreshold;
    await item.save();
    
    res.status(201).json({ success: true, transaction, item });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get transaction history for specific inventory item
exports.getTransactionHistory = async (req, res) => {
  try {
    const { inventoryId } = req.params;
    
    const transactions = await InventoryTransaction.find({ inventoryId })
      .populate('userId', 'username role')
      .populate('roomId', 'roomNumber')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get room inventory checklist
exports.getRoomChecklist = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { taskId } = req.query;
    
    console.log('Fetching checklist for roomId:', roomId, 'taskId:', taskId);
    
    const checklist = await RoomInventoryChecklist.findOne({ 
      roomId, 
      housekeepingTaskId: taskId 
    }).populate('items.inventoryId', 'name category');
    
    if (!checklist || checklist.items.length === 0) {
      // Get all inventory items when no checklist exists or checklist is empty
      const allInventory = await Inventory.find({}).sort({ name: 1 });
      
      // Get unique items only (one per item name, ignore stock quantity)
      const uniqueItems = [];
      const seenNames = new Set();
      
      for (const item of allInventory) {
        if (!seenNames.has(item.name)) {
          seenNames.add(item.name);
          uniqueItems.push({
            _id: item._id,
            name: item.name,
            category: item.category
          });
        }
      }
      
      return res.json({ items: uniqueItems, checklist: null });
    }
    
    res.json({ success: true, checklist });
  } catch (error) {
    console.error('Error in getRoomChecklist:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create room inventory checklist
exports.createRoomChecklist = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { housekeepingTaskId, items } = req.body;
    
    const checklist = new RoomInventoryChecklist({
      housekeepingTaskId,
      roomId,
      checkedBy: req.user.id,
      items
    });
    
    await checklist.save();
    res.status(201).json(checklist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update checklist and auto-deduct stock
exports.updateChecklist = async (req, res) => {
  try {
    const { checklistId } = req.params;
    const { items, status } = req.body;
    
    const updateData = { items };
    if (status === 'completed') {
      updateData.status = 'completed';
      updateData.completedAt = new Date();
      
      // Auto-deduct stock for used items
      for (const item of items) {
        if (item.status === 'used' && item.quantity > 0) {
          const inventory = await Inventory.findById(item.inventoryId);
          if (inventory && inventory.currentStock >= item.quantity) {
            const transaction = new InventoryTransaction({
              inventoryId: item.inventoryId,
              transactionType: 'room_allocation',
              quantity: item.quantity,
              previousStock: inventory.currentStock,
              newStock: inventory.currentStock - item.quantity,
              userId: req.user.id,
              roomId: req.params.roomId,
              notes: `Auto-deducted for room ${req.params.roomId}`,
              isAutomatic: true
            });
            
            await transaction.save();
            
            inventory.currentStock -= item.quantity;
            inventory.isLowStock = inventory.currentStock <= inventory.minThreshold;
            await inventory.save();
          }
        }
      }
    }
    
    const checklist = await RoomInventoryChecklist.findByIdAndUpdate(
      checklistId, 
      updateData, 
      { new: true }
    );
    
    res.json(checklist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get low stock alerts
exports.getLowStockAlerts = async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      $expr: { $lte: ['$currentStock', '$minThreshold'] }
    });
    
    const outOfStockItems = await Inventory.find({ currentStock: 0 });
    
    res.json({
      lowStock: lowStockItems,
      outOfStock: outOfStockItems,
      totalAlerts: lowStockItems.length + outOfStockItems.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get inventory summary by category
exports.getInventorySummary = async (req, res) => {
  try {
    const summary = await Inventory.aggregate([
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$currentStock', '$costPerUnit'] } },
          lowStockCount: {
            $sum: {
              $cond: [{ $lte: ['$currentStock', '$minThreshold'] }, 1, 0]
            }
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $eq: ['$currentStock', 0] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get items by category
exports.getItemsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const items = await Inventory.find({ category })
      .sort({ name: 1 });
    
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk stock update (Admin only)
exports.bulkStockUpdate = async (req, res) => {
  try {
    const { updates } = req.body; // Array of {itemId, quantity, type: 'add'|'set'}
    const results = [];
    
    for (const update of updates) {
      const item = await Inventory.findById(update.itemId);
      if (!item) continue;
      
      const previousStock = item.currentStock;
      let newStock;
      
      if (update.type === 'add') {
        newStock = previousStock + parseInt(update.quantity);
        item.lastRestockDate = new Date();
      } else if (update.type === 'set') {
        newStock = parseInt(update.quantity);
      }
      
      // Create transaction
      const transaction = new InventoryTransaction({
        inventoryId: item._id,
        transactionType: update.type === 'add' ? 'add' : 'adjustment',
        quantity: Math.abs(update.quantity),
        previousStock,
        newStock,
        userId: req.user.id,
        notes: `Bulk update: ${update.type}`,
        isAutomatic: false
      });
      
      await transaction.save();
      
      item.currentStock = newStock;
      item.isLowStock = newStock <= item.minThreshold;
      await item.save();
      
      results.push({ itemId: item._id, success: true, newStock });
    }
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Generate reorder report
exports.getReorderReport = async (req, res) => {
  try {
    const reorderItems = await Inventory.find({
      $expr: { $lte: ['$currentStock', '$minThreshold'] }
    });
    
    const report = reorderItems.map(item => ({
      _id: item._id,
      name: item.name,
      category: item.category,
      currentStock: item.currentStock,
      minThreshold: item.minThreshold,
      reorderQuantity: item.reorderQuantity,
      costPerUnit: item.costPerUnit,
      totalCost: item.reorderQuantity * item.costPerUnit,
      supplier: item.supplier,
      urgency: item.currentStock === 0 ? 'Critical' : 'Low'
    }));
    
    res.json({ reorderItems: report, totalItems: report.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};