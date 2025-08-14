require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const env = process.env.NODE_ENV || 'development';
const config = require('../config/database.js')[env];

// Initialize Sequelize with either a connection string or config object
const sequelize = config.use_env_variable
  ? new Sequelize(process.env[config.use_env_variable], config)
  : new Sequelize(config.database, config.username, config.password, config);

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  firstName: DataTypes.STRING,
  lastName: DataTypes.STRING,
  avatar: DataTypes.STRING,
  isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
  isBlocked: { type: DataTypes.BOOLEAN, defaultValue: false },
  googleId: DataTypes.STRING,
  githubId: DataTypes.STRING,
  passwordHash: { type: DataTypes.STRING, allowNull: true },
  language: { type: DataTypes.STRING, defaultValue: 'en' },
  theme: { type: DataTypes.STRING, defaultValue: 'light' }
});

const Category = sequelize.define('Category', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true }
});

const Tag = sequelize.define('Tag', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true }
});

const Inventory = sequelize.define('Inventory', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  image: DataTypes.STRING,
  isPublic: { type: DataTypes.BOOLEAN, defaultValue: false },
  customIdFormat: { type: DataTypes.JSONB, defaultValue: [] },
  customFields: {
    type: DataTypes.JSONB,
    defaultValue: {
      singleLineText: [],
      multiLineText: [],
      numeric: [],
      documentImage: [],
      boolean: []
    }
  },
  version: { type: DataTypes.INTEGER, defaultValue: 1 }
});

const InventoryTag = sequelize.define('InventoryTag', {});

const InventoryAccess = sequelize.define('InventoryAccess', {
  canWrite: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const Item = sequelize.define('Item', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customId: { type: DataTypes.STRING, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  customFields: { type: DataTypes.JSONB, defaultValue: {} },
  likes: { type: DataTypes.INTEGER, defaultValue: 0 },
  version: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
  indexes: [
    {
      unique: true,
      fields: ['inventoryId', 'customId'],
      name: 'inventory_custom_id_unique'
    }
  ]
});

const ItemLike = sequelize.define('ItemLike', {});

const Comment = sequelize.define('Comment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  content: { type: DataTypes.TEXT, allowNull: false }
});

// Associations

User.hasMany(Inventory, { foreignKey: 'creatorId', as: 'createdInventories' });
Inventory.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });

Category.hasMany(Inventory, { foreignKey: 'categoryId' });
Inventory.belongsTo(Category, { foreignKey: 'categoryId' });

Inventory.belongsToMany(Tag, { through: InventoryTag });
Tag.belongsToMany(Inventory, { through: InventoryTag });

User.belongsToMany(Inventory, {
  through: InventoryAccess,
  as: 'accessibleInventories',
  foreignKey: 'userId'
});
Inventory.belongsToMany(User, {
  through: InventoryAccess,
  as: 'accessUsers',
  foreignKey: 'inventoryId'
});

Inventory.hasMany(Item, { foreignKey: 'inventoryId' });
Item.belongsTo(Inventory, { foreignKey: 'inventoryId' });

User.hasMany(Item, { foreignKey: 'createdBy', as: 'createdItems' });
Item.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.belongsToMany(Item, {
  through: ItemLike,
  as: 'likedItems',
  foreignKey: 'userId'
});
Item.belongsToMany(User, {
  through: ItemLike,
  as: 'likeUsers',
  foreignKey: 'itemId'
});

Inventory.hasMany(Comment, { foreignKey: 'inventoryId' });
Comment.belongsTo(Inventory, { foreignKey: 'inventoryId' });

User.hasMany(Comment, { foreignKey: 'userId', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'userId', as: 'author' });

module.exports = {
  sequelize,
  User,
  Category,
  Tag,
  Inventory,
  InventoryTag,
  InventoryAccess,
  Item,
  ItemLike,
  Comment
};
