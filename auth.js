const bcrypt = require('bcrypt')
const express = require('express')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy

const db = require('./db')

const router = express.Router()

passport.use(new LocalStrategy(function(name, password, done) {
  db.User.findOne({ where: { name } })
    .then(user => {
      if (!user) throw Error('user not found')
      return bcrypt.compare(password, user.passwordHash).then(passwordMatches => {
        if (!passwordMatches) throw Error('wrong credentials')
        done(null, user)
      })
    })
    .catch(error => {
      console.log(error)
      done(null, false, Error('incorrect credentials'))
    })
}))

passport.serializeUser((user, done) => {
  done(null, user.id)
});

passport.deserializeUser((id, done) => {
  db.User.findByPk(id)
    .then(user => {
      if (!user) throw Error('user not found')
      done(null, user)
    })
    .catch(error => {
      done(Error('could not deserialize user'), null)
    })
})

exports.authenticate = passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login'
})

exports.initialize = passport.initialize()

exports.session = passport.session()

exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next()
  } else {
    return res.redirect('/login')
  }
}
