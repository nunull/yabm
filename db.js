const moment = require('moment')
const { Sequelize, Model, DataTypes } = require('sequelize')
const sequelize = process.env.DATABASE_URL ?
  new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          rejectUnauthorized: false
        }
      }
  }) :
  new Sequelize({
    dialect: 'sqlite',
    storage: 'data/db.sqlite'
  })



class User extends Model {}

User.init({
  id: {
    primaryKey: true,
    type: DataTypes.UUID,
    defaultValue: Sequelize.UUIDV4
  },
  name: DataTypes.STRING,
  passwordHash: DataTypes.STRING
}, { sequelize })



class Bookmark extends Model {
  tagsList() { 
    return this.tags.split(' ').filter(t => t)
  }
  
  relativeDate() {
    return moment(this.date).fromNow()
  }
}

Bookmark.init({
  id: {
    primaryKey: true,
    type: DataTypes.UUID,
    defaultValue: Sequelize.UUIDV4
  },
  url: DataTypes.STRING,
  description: DataTypes.STRING,
  tags: DataTypes.STRING,
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  sequelize,
  defaultScope: {
    order: [['date', 'DESC']]
  }
})



class QuickView extends Model {
  tagsList() { 
    return this.tags.split(' ').filter(t => t)
  }
}

QuickView.init({
  id: {
    primaryKey: true,
    type: DataTypes.UUID,
    defaultValue: Sequelize.UUIDV4
  },
  name: DataTypes.STRING,
  tags: DataTypes.STRING
}, { sequelize })



User.hasMany(Bookmark)
Bookmark.belongsTo(User)

User.hasMany(QuickView)
QuickView.belongsTo(User)



sequelize.sync().catch(error => {
  console.error(error)
})


module.exports = {
  sequelize,
  User,
  Bookmark,
  QuickView
}