const express = require('express');
const { Op } = require('sequelize');
const { Inventory, Item, User, Category, Tag } = require('../models');
const { sequelize } = require('../models');

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
    const isTagSearch = q.startsWith('#');
    const tagSearchTerm = q.slice(1); // Remove the '#' for tag search
    
    let results = { inventories: [], items: [], totalCount: 0 };
    
    if (type === 'all' || type === 'inventories') {
      const inventoryWhere = isTagSearch 
        ? sequelize.literal(`EXISTS (
            SELECT 1 FROM "InventoryTags" 
            INNER JOIN "Tags" ON "InventoryTags"."TagId" = "Tags"."id" 
            WHERE "InventoryTags"."InventoryId" = "Inventory"."id" 
            AND "Tags"."name" ILIKE '%${tagSearchTerm}%'
          )`)
        : {
            [Op.or]: [
              { title: { [Op.iLike]: searchTerm } },
              { description: { [Op.iLike]: searchTerm } }
            ]
          };

      const inventoryResults = await Inventory.findAndCountAll({
        where: inventoryWhere,
        include: [
          { 
            model: User, 
            as: 'creator', 
            attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] 
          },
          { model: Category, attributes: ['id', 'name'] },
          { 
            model: Tag, 
            attributes: ['id', 'name'], 
            through: { attributes: [] },
            required: isTagSearch // Required for tag search
          }
        ],
        attributes: {
          include: [
            [
              sequelize.literal(`(
                SELECT COUNT(*) 
                FROM "Items" 
                WHERE "Items"."inventoryId" = "Inventory"."id"
              )`),
              'itemCount'
            ]
          ]
        },
        subQuery: false,
        limit: type === 'inventories' ? parseInt(limit) : Math.ceil(limit / 2),
        offset: type === 'inventories' ? parseInt(offset) : 0,
        order: [['createdAt', 'DESC']],
        raw: true,
        nest: true
      });
      
      // Process the raw results to include nested associations
      const processedResults = inventoryResults.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        itemCount: parseInt(row.itemCount, 10) || 0,
        owner: row.creator ? {
          id: row.creator.id,
          username: row.creator.username,
          firstName: row.creator.firstName,
          lastName: row.creator.lastName,
          avatar: row.creator.avatar,
          name: [row.creator.firstName, row.creator.lastName].filter(Boolean).join(' ') || row.creator.username
        } : null
      }));
      
      results.inventories = processedResults;
      if (type === 'inventories') {
        results.totalCount = inventoryResults.count.length || 0;
      }
    }
    
    if (type === 'all' || type === 'items') {
      const itemWhere = isTagSearch
        ? sequelize.literal(`EXISTS (
            SELECT 1 FROM "InventoryTags" 
            INNER JOIN "Tags" ON "InventoryTags"."TagId" = "Tags"."id" 
            WHERE "InventoryTags"."InventoryId" = "Inventory"."id" 
            AND "Tags"."name" ILIKE '%${tagSearchTerm}%'
          )`)
        : {
            [Op.or]: [
              { customId: { [Op.iLike]: searchTerm } },
              { title: { [Op.iLike]: searchTerm } },
              { 'customFields': { [Op.contains]: q } }
            ]
          };

      const itemResults = await Item.findAndCountAll({
        where: itemWhere,
        include: [
          { 
            model: User, 
            as: 'creator', 
            attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] 
          },
          { 
            model: Inventory, 
            attributes: ['id', 'title'],
            include: [
              {
                model: Tag,
                attributes: ['id', 'name'],
                through: { attributes: [] },
                required: isTagSearch // Required for tag search
              }
            ]
          }
        ],
        limit: type === 'items' ? parseInt(limit) : Math.ceil(limit / 2),
        offset: type === 'items' ? parseInt(offset) : 0,
        order: [['createdAt', 'DESC']],
        raw: true,
        nest: true
      });
      
      // Process the raw results to include nested associations
      const processedResults = itemResults.rows.map(row => ({
        id: row.id,
        title: row.title,
        customId: row.customId,
        serial: row.serial,
        inventory: row.Inventory ? {
          id: row.Inventory.id,
          title: row.Inventory.title
        } : null,
        inventoryTitle: row.Inventory?.title,
        customFields: row.customFields
      }));
      
      results.items = processedResults;
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
    res.status(500).json({ 
      message: 'Search failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;