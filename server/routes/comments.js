const express = require('express');
const passport = require('passport');
const { Comment, User, Inventory, InventoryAccess } = require('../models');

const router = express.Router();

// Get comments for inventory
router.get('/inventory/:inventoryId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await Comment.findAndCountAll({
      where: { inventoryId: req.params.inventoryId },
      include: [
        { 
          model: User, 
          as: 'author', 
          attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] 
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'ASC']]
    });
    
    res.json({
      comments: rows,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

// Create new comment
router.post('/',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { inventoryId, content } = req.body;
      
      // Verify inventory exists and user has access
      const inventory = await Inventory.findByPk(inventoryId);
      if (!inventory) {
        return res.status(404).json({ message: 'Inventory not found' });
      }
      
      const comment = await Comment.create({
        inventoryId,
        content,
        userId: req.user.id
      });
      
      // Fetch complete comment with author info
      const createdComment = await Comment.findByPk(comment.id, {
        include: [
          { 
            model: User, 
            as: 'author', 
            attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] 
          }
        ]
      });
      
      // Emit real-time update
      req.app.get('io').to(inventoryId).emit('commentAdded', createdComment);
      
      res.status(201).json(createdComment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ message: 'Failed to create comment' });
    }
  }
);

// Update comment
router.put('/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const comment = await Comment.findByPk(req.params.id, {
        include: [{ model: Inventory }]
      });
      
      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }
      
      // Check permissions - only comment author or admin can edit
      if (!req.user.isAdmin && comment.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const { content } = req.body;
      await comment.update({ content });
      
      // Fetch updated comment with author info
      const updatedComment = await Comment.findByPk(comment.id, {
        include: [
          { 
            model: User, 
            as: 'author', 
            attributes: ['id', 'username', 'firstName', 'lastName', 'avatar'] 
          }
        ]
      });
      
      // Emit real-time update
      req.app.get('io').to(comment.inventoryId).emit('commentUpdated', updatedComment);
      
      res.json(updatedComment);
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({ message: 'Failed to update comment' });
    }
  }
);

// Delete comment
router.delete('/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const comment = await Comment.findByPk(req.params.id);
      
      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }
      
      // Check permissions - only comment author or admin can delete
      if (!req.user.isAdmin && comment.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const inventoryId = comment.inventoryId;
      await comment.destroy();
      
      // Emit real-time update
      req.app.get('io').to(inventoryId).emit('commentDeleted', { id: req.params.id });
      
      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ message: 'Failed to delete comment' });
    }
  }
);

module.exports = router;