const express = require('express');
const { Op } = require('sequelize');
const passport = require('passport');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { Inventory, User, Category, Tag, Item, InventoryAccess } = require('../models');

const router = express.Router();

// Middleware to attempt JWT auth but proceed if missing/invalid
const tryAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (user) req.user = user;
    return next();
  })(req, res, next);
};
// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'inventory-images',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
  },
});

const upload = multer({ storage: storage });

// Middleware to check if user can access inventory
const checkInventoryAccess = async (req, res, next) => {
  try {
    const inventory = await Inventory.findByPk(req.params.id, {
      include: [
        { model: User, as: 'creator' },
        { model: User, as: 'accessUsers', through: { attributes: ['canWrite'] } }
      ]
    });
    
    if (!inventory) {
      return res.status(404).json({ message: 'Inventory not found' });
    }
    
    // Allow if inventory is public, or user is creator/admin/has access
    const hasAccess = inventory.isPublic || (
      req.user && (
        req.user.isAdmin ||
        inventory.creatorId === req.user.id ||
        inventory.accessUsers.some(user => user.id === req.user.id)
      )
    );
    
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    req.inventory = inventory;
    next();
  } catch (error) {
    console.error('Error checking inventory access:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all inventories with pagination and filters
// Admins see all. Authenticated non-admins see their own, shared, or public. Guests see public only.
router.get('/', tryAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, tags, search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = {};
    let include = [
      { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
      { model: Category, attributes: ['id', 'name'] },
      { model: Tag, attributes: ['id', 'name'], through: { attributes: [] } },
      { model: Item, attributes: ['id'], required: false }
    ];
    
    // Search functionality
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    // Category filter
    if (category) {
      whereClause.categoryId = category;
    }
    
    // Tags filter
    if (tags) {
      const tagNames = tags.split(',');
      include.push({
        model: Tag,
        where: { name: { [Op.in]: tagNames } },
        through: { attributes: [] },
        required: true
      });
    }

    // Visibility rules
    if (req.user?.isAdmin) {
      // admins see everything; no extra filter
    } else if (req.user) {
      // authenticated non-admins: own, shared, or public
      include.push({
        model: User,
        as: 'accessUsers',
        attributes: ['id'],
        through: { attributes: [] },
        where: { id: req.user.id },
        required: false,
      });

      // combine with existing whereClause (preserving search/category/tag constraints)
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { isPublic: true },
          { creatorId: req.user.id },
          { '$accessUsers.id$': req.user.id },
        ],
      };
    } else {
      // guests: only public
      whereClause = { ...whereClause, isPublic: true };
    }
    
    const { count, rows } = await Inventory.findAndCountAll({
      where: whereClause,
      include,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      distinct: true
    });
    
    // Calculate item counts and add to response
    const inventoriesWithCounts = rows.map(inventory => ({
      ...inventory.toJSON(),
      itemCount: inventory.Items ? inventory.Items.length : 0
    }));
    
    res.json({
      inventories: inventoriesWithCounts,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching inventories:', error);
    res.status(500).json({ message: 'Failed to fetch inventories' });
  }
});

// Get latest inventories for homepage
router.get('/latest', async (req, res) => {
  try {
    const inventories = await Inventory.findAll({
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { model: Category, attributes: ['id', 'name'] },
        { model: Item, attributes: ['id'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    const inventoriesWithCounts = inventories.map(inventory => ({
      ...inventory.toJSON(),
      itemCount: inventory.Items ? inventory.Items.length : 0
    }));
    
    res.json(inventoriesWithCounts);
  } catch (error) {
    console.error('Error fetching latest inventories:', error);
    res.status(500).json({ message: 'Failed to fetch latest inventories' });
  }
});

// Get most popular inventories
router.get('/popular', async (req, res) => {
  try {
    const inventories = await Inventory.findAll({
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { model: Category, attributes: ['id', 'name'] },
        { model: Item, attributes: ['id'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    
    // Sort by item count (most popular)
    const inventoriesWithCounts = inventories
      .map(inventory => ({
        ...inventory.toJSON(),
        itemCount: inventory.Items ? inventory.Items.length : 0
      }))
      .sort((a, b) => b.itemCount - a.itemCount);
    
    res.json(inventoriesWithCounts);
  } catch (error) {
    console.error('Error fetching popular inventories:', error);
    res.status(500).json({ message: 'Failed to fetch popular inventories' });
  }
});

// Get single inventory
router.get('/:id', tryAuth, checkInventoryAccess, async (req, res) => {
  try {
    const inventory = await Inventory.findByPk(req.params.id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { model: Category, attributes: ['id', 'name'] },
        { model: Tag, attributes: ['id', 'name'], through: { attributes: [] } },
        { 
          model: User, 
          as: 'accessUsers', 
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: ['canWrite'] }
        }
      ]
    });
    
    if (!inventory) {
      return res.status(404).json({ message: 'Inventory not found' });
    }
    
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ message: 'Failed to fetch inventory' });
  }
});

// Upload inventory image
router.post('/upload',
  passport.authenticate('jwt', { session: false }),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      const { path, filename } = req.file; // cloudinary storage adds path/filename
      const secureUrl = req.file.secure_url || req.file.path || path;
      return res.json({
        url: secureUrl,
        secure_url: secureUrl,
        imageUrl: secureUrl,
        public_id: filename || req.file.public_id || null
      });
    } catch (error) {
      console.error('Error uploading inventory image:', error);
      res.status(500).json({ message: 'Failed to upload image' });
    }
  }
);

// Create new inventory
router.post('/', 
  passport.authenticate('jwt', { session: false }), 
  upload.single('image'),
  async (req, res) => {
    try {
      const { title, description, categoryId, tags, isPublic, customIdFormat, customFields, imageUrl } = req.body;
      
      const inventory = await Inventory.create({
        title,
        description,
        categoryId: categoryId || null,
        isPublic: isPublic === 'true',
        customIdFormat: customIdFormat ? JSON.parse(customIdFormat) : [],
        customFields: customFields ? JSON.parse(customFields) : {
          singleLineText: [],
          multiLineText: [],
          numeric: [],
          documentImage: [],
          boolean: []
        },
        image: req.file ? req.file.secure_url : (imageUrl || null),
        creatorId: req.user.id
      });
      
      // Handle tags
      if (tags) {
        const tagNames = JSON.parse(tags);
        const tagInstances = await Promise.all(
          tagNames.map(async (tagName) => {
            const [tag] = await Tag.findOrCreate({
              where: { name: tagName.toLowerCase() }
            });
            return tag;
          })
        );
        await inventory.setTags(tagInstances);
      }
      
      // Fetch the complete inventory with associations
      const createdInventory = await Inventory.findByPk(inventory.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
          { model: Category, attributes: ['id', 'name'] },
          { model: Tag, attributes: ['id', 'name'], through: { attributes: [] } }
        ]
      });
      
      res.status(201).json(createdInventory);
    } catch (error) {
      console.error('Error creating inventory:', error);
      res.status(500).json({ message: 'Failed to create inventory' });
    }
  }
);

// Update inventory
router.put('/:id',
  passport.authenticate('jwt', { session: false }),
  upload.single('image'),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);
      
      if (!inventory) {
        return res.status(404).json({ message: 'Inventory not found' });
      }
      
      // Check permissions
      if (!req.user.isAdmin && inventory.creatorId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Optimistic locking check
      const { version } = req.body;
      if (version && parseInt(version) !== inventory.version) {
        return res.status(409).json({ 
          message: 'Inventory was modified by another user. Please refresh and try again.',
          currentVersion: inventory.version
        });
      }
      
      const { title, description, categoryId, tags, isPublic, customIdFormat, customFields, imageUrl } = req.body;
      
      const updateData = {
        title: title || inventory.title,
        description: description !== undefined ? description : inventory.description,
        categoryId: categoryId !== undefined ? categoryId : inventory.categoryId,
        isPublic: isPublic !== undefined ? isPublic === 'true' : inventory.isPublic,
        version: inventory.version + 1
      };
      
      if (customIdFormat) {
        updateData.customIdFormat = JSON.parse(customIdFormat);
      }
      
      if (customFields) {
        updateData.customFields = JSON.parse(customFields);
      }
      
      if (req.file) {
        updateData.image = req.file.secure_url;
      } else if (imageUrl) {
        updateData.image = imageUrl;
      }
      
      await inventory.update(updateData);
      
      // Handle tags
      if (tags) {
        const tagNames = JSON.parse(tags);
        const tagInstances = await Promise.all(
          tagNames.map(async (tagName) => {
            const [tag] = await Tag.findOrCreate({
              where: { name: tagName.toLowerCase() }
            });
            return tag;
          })
        );
        await inventory.setTags(tagInstances);
      }
      
      // Fetch updated inventory with associations
      const updatedInventory = await Inventory.findByPk(inventory.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
          { model: Category, attributes: ['id', 'name'] },
          { model: Tag, attributes: ['id', 'name'], through: { attributes: [] } }
        ]
      });
      
      res.json(updatedInventory);
    } catch (error) {
      console.error('Error updating inventory:', error);
      res.status(500).json({ message: 'Failed to update inventory' });
    }
  }
);

// Delete inventory
router.delete('/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);
      
      if (!inventory) {
        return res.status(404).json({ message: 'Inventory not found' });
      }
      
      // Check permissions
      if (!req.user.isAdmin && inventory.creatorId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await inventory.destroy();
      res.json({ message: 'Inventory deleted successfully' });
    } catch (error) {
      console.error('Error deleting inventory:', error);
      res.status(500).json({ message: 'Failed to delete inventory' });
    }
  }
);

// Manage inventory access
router.post('/:id/access',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);
      
      if (!inventory) {
        return res.status(404).json({ message: 'Inventory not found' });
      }
      
      // Check permissions
      if (!req.user.isAdmin && inventory.creatorId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const { userEmail, canWrite = true } = req.body;
      
      const user = await User.findOne({ where: { email: userEmail } });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      await InventoryAccess.findOrCreate({
        where: { inventoryId: inventory.id, userId: user.id },
        defaults: { canWrite }
      });
      
      res.json({ message: 'Access granted successfully' });
    } catch (error) {
      console.error('Error managing inventory access:', error);
      res.status(500).json({ message: 'Failed to manage access' });
    }
  }
);

// Remove inventory access
router.delete('/:id/access/:userId',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);
      
      if (!inventory) {
        return res.status(404).json({ message: 'Inventory not found' });
      }
      
      // Check permissions
      if (!req.user.isAdmin && inventory.creatorId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await InventoryAccess.destroy({
        where: { inventoryId: inventory.id, userId: req.params.userId }
      });
      
      res.json({ message: 'Access removed successfully' });
    } catch (error) {
      console.error('Error removing inventory access:', error);
      res.status(500).json({ message: 'Failed to remove access' });
    }
  }
);

// Get inventory statistics
router.get('/:id/stats', checkInventoryAccess, async (req, res) => {
  try {
    const items = await Item.findAll({
      where: { inventoryId: req.params.id },
      attributes: ['customFields', 'createdAt']
    });
    
    const stats = {
      totalItems: items.length,
      createdToday: items.filter(item => {
        const today = new Date();
        const itemDate = new Date(item.createdAt);
        return itemDate.toDateString() === today.toDateString();
      }).length,
      fieldStats: {}
    };
    
    // Calculate field statistics
    if (req.inventory.customFields) {
      const allFields = [
        ...req.inventory.customFields.singleLineText,
        ...req.inventory.customFields.multiLineText,
        ...req.inventory.customFields.numeric,
        ...req.inventory.customFields.documentImage,
        ...req.inventory.customFields.boolean
      ];
      
      allFields.forEach(field => {
        const fieldValues = items
          .map(item => item.customFields[field.name])
          .filter(value => value !== null && value !== undefined && value !== '');
        
        stats.fieldStats[field.name] = {
          filledCount: fieldValues.length,
          emptyCount: items.length - fieldValues.length
        };
        
        if (field.type === 'numeric') {
          const numericValues = fieldValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
          if (numericValues.length > 0) {
            stats.fieldStats[field.name] = {
              ...stats.fieldStats[field.name],
              min: Math.min(...numericValues),
              max: Math.max(...numericValues),
              avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length
            };
          }
        } else if (field.type === 'singleLineText') {
          const valueCounts = {};
          fieldValues.forEach(value => {
            valueCounts[value] = (valueCounts[value] || 0) + 1;
          });
          stats.fieldStats[field.name].mostCommon = Object.entries(valueCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([value, count]) => ({ value, count }));
        }
      });
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

module.exports = router;