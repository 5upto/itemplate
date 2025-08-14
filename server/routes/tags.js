const express = require('express');
const { Op } = require('sequelize');
const { Tag, InventoryTag, Inventory } = require('../models');

const router = express.Router();

// Get all tags for tag cloud
router.get('/', async (req, res) => {
  try {
    const tags = await Tag.findAll({
      include: [
        {
          model: Inventory,
          through: { attributes: [] },
          attributes: ['id'],
          required: false
        }
      ],
      order: [['name', 'ASC']]
    });
    
    // Add inventory count to each tag
    const tagsWithCounts = tags.map(tag => ({
      ...tag.toJSON(),
      inventoryCount: tag.Inventories ? tag.Inventories.length : 0
    }));
    
    res.json(tagsWithCounts);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

// Autocomplete tags
router.get('/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) {
      return res.json([]);
    }
    
    const tags = await Tag.findAll({
      where: {
        name: { [Op.iLike]: `%${q}%` }
      },
      attributes: ['id', 'name'],
      limit: 10,
      order: [['name', 'ASC']]
    });
    
    res.json(tags.map(tag => tag.name));
  } catch (error) {
    console.error('Error autocompleting tags:', error);
    res.status(500).json({ message: 'Failed to autocomplete tags' });
  }
});

// Get inventories by tag
router.get('/:tagName/inventories', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const tag = await Tag.findOne({
      where: { name: req.params.tagName.toLowerCase() }
    });
    
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    
    const { count, rows } = await Inventory.findAndCountAll({
      include: [
        {
          model: Tag,
          where: { id: tag.id },
          through: { attributes: [] }
        },
        { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
        { model: Category, attributes: ['id', 'name'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      distinct: true
    });
    
    res.json({
      inventories: rows,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      tag: tag.name
    });
  } catch (error) {
    console.error('Error fetching inventories by tag:', error);
    res.status(500).json({ message: 'Failed to fetch inventories' });
  }
});

module.exports = router;