const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const { Op } = require('sequelize');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const { Item, Inventory, User, ItemLike, InventoryAccess } = require('../models');

const router = express.Router();

// Cloudinary configuration for item images
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const itemStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'item-images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  },
});

const itemUpload = multer({ storage: itemStorage });

// Helper function to generate custom ID
const generateCustomId = (format, inventoryId, itemCount) => {
  let customId = '';
  
  format.forEach(element => {
    switch (element.type) {
      case 'text':
        customId += element.value || '';
        break;
      case 'random20':
        customId += Math.floor(Math.random() * Math.pow(2, 20)).toString(16).padStart(5, '0');
        break;
      case 'random32':
        customId += Math.floor(Math.random() * Math.pow(2, 32)).toString(16).padStart(8, '0');
        break;
      case 'random6':
        customId += Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        break;
      case 'random9':
        customId += Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        break;
      case 'guid':
        customId += uuidv4();
        break;
      case 'datetime':
        const now = new Date();
        const format = element.format || 'YYYYMMDD';
        if (format === 'YYYYMMDD') {
          customId += now.getFullYear().toString() +
                     (now.getMonth() + 1).toString().padStart(2, '0') +
                     now.getDate().toString().padStart(2, '0');
        } else if (format === 'YYYY-MM-DD') {
          customId += now.toISOString().split('T')[0];
        }
        break;
      case 'sequence':
        const seqValue = (itemCount + 1).toString();
        const padding = element.padding || 0;
        customId += padding > 0 ? seqValue.padStart(padding, '0') : seqValue;
        break;
      default:
        break;
    }
  });
  
  return customId;
};

// Check if user can write to inventory
const checkWriteAccess = async (req, res, next) => {
  try {
    const inventory = await Inventory.findByPk(req.body.inventoryId || req.params.inventoryId, {
      include: [
        { model: User, as: 'accessUsers', through: { attributes: ['canWrite'] } }
      ]
    });
    
    if (!inventory) {
      return res.status(404).json({ message: 'Inventory not found' });
    }
    
    // Check permissions
    const hasWriteAccess = req.user.isAdmin || 
      inventory.creatorId === req.user.id ||
      inventory.isPublic ||
      inventory.accessUsers.some(user => user.id === req.user.id && user.InventoryAccess.canWrite);
    
    if (!hasWriteAccess) {
      return res.status(403).json({ message: 'Write access denied' });
    }
    
    req.inventory = inventory;
    next();
  } catch (error) {
    console.error('Error checking write access:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload item image
router.post('/upload',
  passport.authenticate('jwt', { session: false }),
  itemUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      return res.json({ url: req.file.path, secure_url: req.file.path });
    } catch (err) {
      console.error('Error uploading item image:', err);
      res.status(500).json({ message: 'Failed to upload image' });
    }
  }
);

// Get items for inventory
router.get('/inventory/:inventoryId', async (req, res) => {
  try {
    const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'DESC', search } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = { inventoryId: req.params.inventoryId };
    
    // Search functionality
    if (search) {
      whereClause[Op.or] = [
        { customId: { [Op.iLike]: `%${search}%` } },
        { 'customFields': { [Op.contains]: { [Op.any]: [`%${search}%`] } } }
      ];
    }
    
    const { count, rows } = await Item.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { 
          model: User, 
          as: 'likeUsers', 
          attributes: ['id'], 
          through: { attributes: [] },
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]]
    });
    
    // Add like count to each item
    const itemsWithLikes = rows.map(item => ({
      ...item.toJSON(),
      likeCount: item.likeUsers ? item.likeUsers.length : 0,
      isLikedByUser: req.user ? item.likeUsers.some(user => user.id === req.user.id) : false
    }));
    
    res.json({
      items: itemsWithLikes,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
});

// Get single item
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { model: Inventory, attributes: ['id', 'title', 'customFields'] },
        { 
          model: User, 
          as: 'likeUsers', 
          attributes: ['id', 'username'], 
          through: { attributes: [] },
          required: false
        }
      ]
    });
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const itemWithLikes = {
      ...item.toJSON(),
      likeCount: item.likeUsers ? item.likeUsers.length : 0,
      isLikedByUser: req.user ? item.likeUsers.some(user => user.id === req.user.id) : false
    };
    
    res.json(itemWithLikes);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Failed to fetch item' });
  }
});

// Create new item
router.post('/',
  passport.authenticate('jwt', { session: false }),
  checkWriteAccess,
  async (req, res) => {
    try {
      const { inventoryId, customFields, title, description } = req.body;
      
      // Get current item count for sequence generation
      const itemCount = await Item.count({ where: { inventoryId } });
      
      // Generate custom ID
      const customId = generateCustomId(req.inventory.customIdFormat, inventoryId, itemCount);
      
      // Check if custom ID already exists
      const existingItem = await Item.findOne({
        where: { inventoryId, customId }
      });
      
      if (existingItem) {
        return res.status(400).json({ message: 'Custom ID already exists. Please try again.' });
      }
      
      const item = await Item.create({
        inventoryId,
        customId,
        title: title || null,
        description: description || null,
        customFields: customFields || {},
        createdBy: req.user.id
      });
      
      // Fetch complete item with associations
      const createdItem = await Item.findByPk(item.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
          { model: Inventory, attributes: ['id', 'title'] }
        ]
      });
      
      // Emit real-time update
      req.app.get('io').to(inventoryId).emit('itemCreated', createdItem);
      
      res.status(201).json(createdItem);
    } catch (error) {
      console.error('Error creating item:', error);
      if (error.name === 'SequelizeUniqueConstraintError') {
        res.status(400).json({ message: 'Custom ID already exists. Please try again.' });
      } else {
        res.status(500).json({ message: 'Failed to create item' });
      }
    }
  }
);

// Update item
router.put('/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const item = await Item.findByPk(req.params.id, {
        include: [{ model: Inventory }]
      });
      
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      // Check write access
      const inventory = item.Inventory;
      const accessRecord = await InventoryAccess.findOne({
        where: { inventoryId: inventory.id, userId: req.user.id }
      });
      
      const hasWriteAccess = req.user.isAdmin || 
        inventory.creatorId === req.user.id ||
        inventory.isPublic ||
        (accessRecord && accessRecord.canWrite);
      
      if (!hasWriteAccess) {
        return res.status(403).json({ message: 'Write access denied' });
      }
      
      // Optimistic locking check
      const { version } = req.body;
      if (version && parseInt(version) !== item.version) {
        return res.status(409).json({ 
          message: 'Item was modified by another user. Please refresh and try again.',
          currentVersion: item.version
        });
      }
      
      const { customId, customFields, title, description } = req.body;
      
      // Validate custom ID format if changed
      if (customId && customId !== item.customId) {
        const existingItem = await Item.findOne({
          where: { 
            inventoryId: item.inventoryId, 
            customId,
            id: { [Op.ne]: item.id }
          }
        });
        
        if (existingItem) {
          return res.status(400).json({ message: 'Custom ID already exists' });
        }
      }
      
      await item.update({
        customId: customId || item.customId,
        title: typeof title !== 'undefined' ? title : item.title,
        description: typeof description !== 'undefined' ? description : item.description,
        customFields: customFields || item.customFields,
        version: item.version + 1
      });
      
      // Fetch updated item with associations
      const updatedItem = await Item.findByPk(item.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
          { model: Inventory, attributes: ['id', 'title'] }
        ]
      });
      
      // Emit real-time update
      req.app.get('io').to(item.inventoryId).emit('itemUpdated', updatedItem);
      
      res.json(updatedItem);
    } catch (error) {
      console.error('Error updating item:', error);
      res.status(500).json({ message: 'Failed to update item' });
    }
  }
);

// Delete item
router.delete('/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const item = await Item.findByPk(req.params.id, {
        include: [{ model: Inventory }]
      });
      
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      // Check write access
      const inventory = item.Inventory;
      const accessRecord = await InventoryAccess.findOne({
        where: { inventoryId: inventory.id, userId: req.user.id }
      });
      
      const hasWriteAccess = req.user.isAdmin || 
        inventory.creatorId === req.user.id ||
        inventory.isPublic ||
        (accessRecord && accessRecord.canWrite);
      
      if (!hasWriteAccess) {
        return res.status(403).json({ message: 'Write access denied' });
      }
      
      const inventoryId = item.inventoryId;
      await item.destroy();
      
      // Emit real-time update
      req.app.get('io').to(inventoryId).emit('itemDeleted', { id: req.params.id });
      
      res.json({ message: 'Item deleted successfully' });
    } catch (error) {
      console.error('Error deleting item:', error);
      res.status(500).json({ message: 'Failed to delete item' });
    }
  }
);

// Like/unlike item
router.post('/:id/like',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const item = await Item.findByPk(req.params.id);
      
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      const existingLike = await ItemLike.findOne({
        where: { itemId: item.id, userId: req.user.id }
      });
      
      if (existingLike) {
        // Unlike
        await existingLike.destroy();
        await item.decrement('likes');
        res.json({ message: 'Item unliked', liked: false });
      } else {
        // Like
        await ItemLike.create({
          itemId: item.id,
          userId: req.user.id
        });
        await item.increment('likes');
        res.json({ message: 'Item liked', liked: true });
      }
      
      // Emit real-time update
      const updatedItem = await Item.findByPk(item.id, {
        include: [
          { 
            model: User, 
            as: 'likeUsers', 
            attributes: ['id'], 
            through: { attributes: [] },
            required: false
          }
        ]
      });
      
      req.app.get('io').to(item.inventoryId).emit('itemLiked', {
        itemId: item.id,
        likeCount: updatedItem.likeUsers ? updatedItem.likeUsers.length : 0
      });
    } catch (error) {
      console.error('Error liking item:', error);
      res.status(500).json({ message: 'Failed to like item' });
    }
  }
);

module.exports = router;