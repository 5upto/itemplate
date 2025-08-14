const express = require('express');
const { Op } = require('sequelize');
const { Inventory, Item, User, Category, Tag } = require('../models');

const router = express.Router();

// Full-text search across inventories and items
router.get('/', async (req, res) => {
  try {
    const { q, page = 1, limit = 20, type = 'all' } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({
        inventories: [],
        items: [],
        totalCount: 0,
        query: q
      });
    }
    
    const offset = (page - 1) * limit;
    const searchTerm = `%${q}%`;
    
    let results = { inventories: [], items: [], totalCount: 0 };
    
    if (type === 'all' || type === 'inventories') {
      const inventoryResults = await Inventory.findAndCountAll({
        where: {
          [Op.or]: [
            { title: { [Op.iLike]: searchTerm } },
            { description: { [Op.iLike]: searchTerm } }
          ]
        },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
          { model: Category, attributes: ['id', 'name'] },
          { model: Tag, attributes: ['id', 'name'], through: { attributes: [] } }
        ],
        limit: type === 'inventories' ? parseInt(limit) : Math.ceil(limit / 2),
        offset: type === 'inventories' ? parseInt(offset) : 0,
        order: [['createdAt', 'DESC']],
        distinct: true
      });
      
      results.inventories = inventoryResults.rows;
      if (type === 'inventories') {
        results.totalCount = inventoryResults.count;
      }
    }
    
    if (type === 'all' || type === 'items') {
      const itemResults = await Item.findAndCountAll({
        where: {
          [Op.or]: [
            { customId: { [Op.iLike]: searchTerm } },
            { 'customFields': { [Op.contains]: q } }
          ]
        },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] },
          { model: Inventory, attributes: ['id', 'title'] }
        ],
        limit: type === 'items' ? parseInt(limit) : Math.ceil(limit / 2),
        offset: type === 'items' ? parseInt(offset) : 0,
        order: [['createdAt', 'DESC']]
      });
      
      results.items = itemResults.rows;
      if (type === 'items') {
        results.totalCount = itemResults.count;
      }
    }
    
    if (type === 'all') {
      results.totalCount = results.inventories.length + results.items.length;
    }
    
    results.query = q;
    results.totalPages = Math.ceil(results.totalCount / limit);
    results.currentPage = parseInt(page);
    
    res.json(results);
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

module.exports = router;