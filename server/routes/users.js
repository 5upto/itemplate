const express = require('express');
const passport = require('passport');
const { Op } = require('sequelize');
const { User, Inventory, InventoryAccess, Category } = require('../models');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

// Configure Cloudinary for avatar uploads
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'user-avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'faces' }],
  },
});
const uploadAvatar = multer({ storage: avatarStorage });

// Get all users (admin only)
router.get('/',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
      const offset = (page - 1) * limit;
      
      let whereClause = {};
      if (search) {
        whereClause[Op.or] = [
          { username: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } }
        ];
      }
      
      const { count, rows } = await User.findAndCountAll({
        where: whereClause,
        attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar', 'isAdmin', 'isBlocked', 'createdAt'],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[sortBy, sortOrder.toUpperCase()]]
      });
      
      res.json({
        users: rows,
        totalCount: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page)
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  }
);

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar', 'createdAt'],
      include: [
        {
          model: Inventory,
          as: 'createdInventories',
          attributes: ['id', 'title', 'description', 'image', 'createdAt'],
          limit: 10,
          order: [['createdAt', 'DESC']]
        }
      ]
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

// Update current user's avatar
router.post('/me/avatar',
  passport.authenticate('jwt', { session: false }),
  uploadAvatar.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      const url = req.file.secure_url || req.file.path;
      await req.user.update({ avatar: url });
      return res.json({ message: 'Avatar updated', avatar: url });
    } catch (error) {
      console.error('Error updating avatar:', error);
      return res.status(500).json({ message: 'Failed to update avatar' });
    }
  }
);

// Get user's inventories (own and accessible)
router.get('/:id/inventories',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      if (String(req.user.id) !== String(req.params.id) && !req.user.isAdmin) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Get owned inventories
      const ownedInventories = await Inventory.findAll({
        where: { creatorId: req.params.id },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName'] },
          { model: Category, attributes: ['id', 'name'] }
        ],
        order: [['createdAt', 'DESC']]
      });

      // Get accessible inventories
      let accessibleInventories;
      if (req.user.isAdmin) {
        // Admins can access everything: show all inventories not owned by the target user
        accessibleInventories = await Inventory.findAll({
          where: { creatorId: { [Op.ne]: req.params.id } },
          include: [
            { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName'] },
            { model: Category, attributes: ['id', 'name'] }
          ],
          order: [['createdAt', 'DESC']]
        });
      } else {
        // Non-admin: public inventories not owned by the user OR inventories explicitly shared with the user
        accessibleInventories = await Inventory.findAll({
          where: {
            creatorId: { [Op.ne]: req.params.id },
            [Op.or]: [
              { isPublic: true },
              { '$accessUsers.id$': req.params.id }
            ]
          },
          include: [
            {
              model: User,
              as: 'accessUsers',
              attributes: ['id'],
              through: { attributes: ['canWrite'] },
              required: false
            },
            { model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName'] },
            { model: Category, attributes: ['id', 'name'] }
          ],
          distinct: true,
          order: [['createdAt', 'DESC']]
        });
      }
      
      res.json({
        owned: ownedInventories,
        accessible: accessibleInventories
      });
    } catch (error) {
      console.error('Error fetching user inventories:', error);
      res.status(500).json({ message: 'Failed to fetch inventories' });
    }
  }
);

// Block/unblock user (admin only)
router.put('/:id/block',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      await user.update({ isBlocked: !user.isBlocked });
      res.json({ message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully` });
    } catch (error) {
      console.error('Error blocking/unblocking user:', error);
      res.status(500).json({ message: 'Failed to update user status' });
    }
  }
);

// Grant/revoke admin access (admin only)
router.put('/:id/admin',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      await user.update({ isAdmin: !user.isAdmin });
      res.json({ message: `Admin access ${user.isAdmin ? 'granted' : 'revoked'} successfully` });
    } catch (error) {
      console.error('Error updating admin access:', error);
      res.status(500).json({ message: 'Failed to update admin access' });
    }
  }
);

// Delete user (admin only)
router.delete('/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      await user.destroy();
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Failed to delete user' });
    }
  }
);

// Search users (for access management)
router.get('/search/autocomplete',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.length < 2) {
        return res.json([]);
      }
      
      const users = await User.findAll({
        where: {
          [Op.or]: [
            { username: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } },
            { firstName: { [Op.iLike]: `%${q}%` } },
            { lastName: { [Op.iLike]: `%${q}%` } }
          ],
          isBlocked: false
        },
        attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar'],
        limit: 10
      });
      
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ message: 'Failed to search users' });
    }
  }
);

module.exports = router;