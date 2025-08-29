const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const { Op } = require('sequelize');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const { Item, Inventory, User, ItemLike, InventoryAccess } = require('../models');

const router = express.Router();

// Middleware to attempt JWT auth but proceed even if unauthenticated
const tryAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (user) req.user = user;
    return next();
  })(req, res, next);
};

// Map JSON customFields payload into the fixed-slot columns using the
// current inventory customFields definition. We keep it simple:
// - String slots take values from singleLineText then multiLineText (order preserved)
// - Integer slots take from numeric
// - Boolean slots take from boolean
// - documentImage is ignored for slots (remains in JSON)
// Only the first 3 values per type are stored due to available slots.
const mapCustomFieldsToSlots = (inventoryCF = {}, payloadCF = {}) => {
  const strings = [];
  const nums = [];
  const bools = [];

  const invSL = Array.isArray(inventoryCF.singleLineText) ? inventoryCF.singleLineText : [];
  const invML = Array.isArray(inventoryCF.multiLineText) ? inventoryCF.multiLineText : [];
  const invNum = Array.isArray(inventoryCF.numeric) ? inventoryCF.numeric : [];
  const invBool = Array.isArray(inventoryCF.boolean) ? inventoryCF.boolean : [];

  const paySL = payloadCF?.singleLineText || {};
  const payML = payloadCF?.multiLineText || {};
  const payNum = payloadCF?.numeric || {};
  const payBool = payloadCF?.boolean || {};

  // Collect strings in stable order by index within each type list
  invSL.forEach((name, idx) => {
    if (strings.length < 3) strings.push(
      paySL[name] ?? paySL[idx] ?? payloadCF[name] ?? payloadCF[idx] ?? null
    );
  });
  invML.forEach((name, idx) => {
    if (strings.length < 3) strings.push(
      payML[name] ?? payML[idx] ?? payloadCF[name] ?? payloadCF[idx] ?? null
    );
  });
  invNum.forEach((name, idx) => {
    if (nums.length < 3) nums.push(
      payNum[name] ?? payNum[idx] ?? payloadCF[name] ?? payloadCF[idx] ?? null
    );
  });
  invBool.forEach((name, idx) => {
    if (bools.length < 3) bools.push(
      payBool[name] ?? payBool[idx] ?? payloadCF[name] ?? payloadCF[idx] ?? null
    );
  });

  const out = {};
  if (strings[0] !== undefined) out.string1 = strings[0];
  if (strings[1] !== undefined) out.string2 = strings[1];
  if (strings[2] !== undefined) out.string3 = strings[2];
  if (nums[0] !== undefined) out.int1 = (nums[0] === '' || nums[0] === null) ? null : Number(nums[0]);
  if (nums[1] !== undefined) out.int2 = (nums[1] === '' || nums[1] === null) ? null : Number(nums[1]);
  if (nums[2] !== undefined) out.int3 = (nums[2] === '' || nums[2] === null) ? null : Number(nums[2]);
  if (bools[0] !== undefined) out.bool1 = typeof bools[0] === 'boolean' ? bools[0] : !!bools[0];
  if (bools[1] !== undefined) out.bool2 = typeof bools[1] === 'boolean' ? bools[1] : !!bools[1];
  if (bools[2] !== undefined) out.bool3 = typeof bools[2] === 'boolean' ? bools[2] : !!bools[2];
  return out;
};

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
router.get('/inventory/:inventoryId', tryAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'DESC', search } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = { inventoryId: req.params.inventoryId };
    
    // Search functionality
    if (search) {
      whereClause[Op.or] = [
        { customId: { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { string1: { [Op.iLike]: `%${search}%` } },
        { string2: { [Op.iLike]: `%${search}%` } },
        { string3: { [Op.iLike]: `%${search}%` } }
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
router.get('/:id', tryAuth, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { 
          model: Inventory, 
          attributes: [
            'id', 'title', 'customFields',
            // fixed template fields for labeling
            'custom_string1_state','custom_string1_name',
            'custom_string2_state','custom_string2_name',
            'custom_string3_state','custom_string3_name',
            'custom_int1_state','custom_int1_name',
            'custom_int2_state','custom_int2_name',
            'custom_int3_state','custom_int3_name',
            'custom_bool1_state','custom_bool1_name',
            'custom_bool2_state','custom_bool2_name',
            'custom_bool3_state','custom_bool3_name'
          ]
        },
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
      // Fixed-slot answers (optional)
      const { string1, string2, string3, int1, int2, int3, bool1, bool2, bool3 } = req.body;
      
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
      
      const createData = {
        inventoryId,
        customId,
        title: title || null,
        description: description || null,
        createdBy: req.user.id
      };
      // If JSON customFields provided, map them to fixed slots using current inventory definition
      if (customFields && typeof customFields === 'object') {
        const slotVals = mapCustomFieldsToSlots(req.inventory.customFields, customFields);
        // Only set if not explicitly provided in body
        ['string1','string2','string3','int1','int2','int3','bool1','bool2','bool3'].forEach((k)=>{
          if (typeof createData[k] === 'undefined' && typeof slotVals[k] !== 'undefined') {
            createData[k] = slotVals[k];
          }
        });
      }
      // Only set provided slot fields (keep nulls untouched by not including undefined)
      if (typeof string1 !== 'undefined') createData.string1 = string1;
      if (typeof string2 !== 'undefined') createData.string2 = string2;
      if (typeof string3 !== 'undefined') createData.string3 = string3;
      if (typeof int1 !== 'undefined') createData.int1 = int1;
      if (typeof int2 !== 'undefined') createData.int2 = int2;
      if (typeof int3 !== 'undefined') createData.int3 = int3;
      if (typeof bool1 !== 'undefined') createData.bool1 = bool1;
      if (typeof bool2 !== 'undefined') createData.bool2 = bool2;
      if (typeof bool3 !== 'undefined') createData.bool3 = bool3;

      const item = await Item.create(createData);
      
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
      const { string1, string2, string3, int1, int2, int3, bool1, bool2, bool3 } = req.body;
      
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
      
      const updateData = {
        customId: customId || item.customId,
        title: typeof title !== 'undefined' ? title : item.title,
        description: typeof description !== 'undefined' ? description : item.description,
        version: item.version + 1
      };
      // If JSON customFields provided, map them to fixed slots using current inventory definition
      if (customFields && typeof customFields === 'object') {
        const slotVals = mapCustomFieldsToSlots(item.Inventory?.customFields || {}, customFields);
        ['string1','string2','string3','int1','int2','int3','bool1','bool2','bool3'].forEach((k)=>{
          if (typeof updateData[k] === 'undefined' && typeof slotVals[k] !== 'undefined') {
            updateData[k] = slotVals[k];
          }
        });
      }
      if (typeof string1 !== 'undefined') updateData.string1 = string1;
      if (typeof string2 !== 'undefined') updateData.string2 = string2;
      if (typeof string3 !== 'undefined') updateData.string3 = string3;
      if (typeof int1 !== 'undefined') updateData.int1 = int1;
      if (typeof int2 !== 'undefined') updateData.int2 = int2;
      if (typeof int3 !== 'undefined') updateData.int3 = int3;
      if (typeof bool1 !== 'undefined') updateData.bool1 = bool1;
      if (typeof bool2 !== 'undefined') updateData.bool2 = bool2;
      if (typeof bool3 !== 'undefined') updateData.bool3 = bool3;

      await item.update(updateData);
      
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