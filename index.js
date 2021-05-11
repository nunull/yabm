const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const express = require('express')
const fetch = require('node-fetch')
const moment = require('moment')

const bcrypt = require('bcrypt')
const session = require('express-session')
const { v4: uuid } = require('uuid')

const db = require('./db')
const auth = require('./auth')

const port = process.env.PORT || 3000

function filterForQuickView (quickView, bookmarks) {
  return sortByDescription(bookmarks
    .filter(b =>
      hasAllTags(b, quickView.tagsList()) &&
      b.tagsList().length === quickView.tagsList().length))
}

function sortByDescription (bookmarks) {
  return bookmarks.sort((a, b) =>
    a.description < b.description ? -1 :
    (a.description > b.description ? 1 : 0)
  )
}

function hasAllTags (bookmark, tags) {
  return tags.every(tag => bookmark.tagsList().indexOf(tag) !== -1)
}

function getTagsFromBookmarks(bookmarks) {
  const tags = []
  
  for (const bookmark of bookmarks) {
    for (const name of bookmark.tagsList()) {
      let tag = tags.find(tag => tag.name === name)
      if (!tag) {
        tag = { name, bookmarks: [] }
        tags.push(tag)
      }
      
      tag.bookmarks.push(bookmark)
    }
  }
  
  return tags
}


function asyncHandler(handler) {
  return (req, res) => {
    handler(req, res).catch(error => {
      console.error(error)
      res.renderWithContext('error', { error })
    })
  }
}


const app = express()

console.log(app.get('env'))

app.set('view engine', 'pug')

app.use(cookieParser())
app.use(bodyParser.urlencoded())
app.use(session({ secret: 'keyboard cat' }))
app.use(auth.initialize)
app.use(auth.session)
app.use(express.static(`${__dirname}/static`))

app.use((req, res, next) => {
  res.renderWithContext = (view, options) => {
    const quickViewsPromise = req.user ? req.user.getQuickViews() : Promise.resolve(null)
    
    quickViewsPromise
      .then(quickViews => {
        const context = { req, quickViews }
        return res.render(view, { ...context, ...options })
      })
      .catch(next)
  }

  next()
})



app.get('/login', (req, res) => {
  res.renderWithContext('login')
})

app.post('/login', auth.authenticate)

app.get('/logout', (req, res) => {
  req.logout()
  res.redirect('/')
})

app.get('/signup', (req, res) => {
  res.renderWithContext('signup')
})

app.post('/signup', asyncHandler(async (req, res) => {
  if (!req.body.username) throw Error('missing username')
  if (!req.body.password) throw Error('missing password')
  
  const passwordHash = await bcrypt.hash(req.body.password, 10)
  
  const existingUser = await db.User.findOne({ where: { name: req.body.username } })
  if (existingUser) throw Error('user already exists')
  
  const user = db.User.build({ name: req.body.username, passwordHash })
  
  await user.save()
  
  res.redirect('/')
}))



app.get('/', auth.isLoggedIn, asyncHandler(async (req, res) => {
  // TODO pagination
  const bookmarks = await req.user.getBookmarks()
  res.renderWithContext('index', { bookmarks })
}))

app.get('/t', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmarks = await req.user.getBookmarks()
  const tags = getTagsFromBookmarks(bookmarks)
  res.renderWithContext('tags', { tags })
}))

app.get('/t/:tag', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmarks = await req.user.getBookmarks()
  const filterTags = req.params.tag.split('+')
  const b = bookmarks.filter(b => hasAllTags(b, filterTags))
  res.renderWithContext('index', { filterTags, bookmarks: b })
}))

app.get('/b/add', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmarks = await req.user.getBookmarks()
  const tags = getTagsFromBookmarks(bookmarks)
  const { url, description } = req.query
  res.renderWithContext('add', { url, description, tags })
}))

app.post('/b/add', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmark = await db.Bookmark.create({
    UserId: req.user.id,
    url: req.body.url,
    description: req.body.description,
    tags: req.body.tags
  })
  
  res.redirect('/')
}))

app.get('/b/:id/edit', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmark = await db.Bookmark.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  res.renderWithContext('edit', { bookmark })
}))

app.post('/b/:id/edit', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmark = await db.Bookmark.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  bookmark.url = req.body.url
  bookmark.description = req.body.description
  bookmark.tags = req.body.tags
  
  await bookmark.save()
  
  res.redirect('/')
}))

app.get('/b/:id/delete', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmark = await db.Bookmark.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  res.renderWithContext('delete', { bookmark })
}))

app.post('/b/:id/delete', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const bookmark = await db.Bookmark.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  await bookmark.destroy()
  
  res.redirect('/')
}))



app.get('/v/add', auth.isLoggedIn, (req, res) => {
  res.renderWithContext('addQuickView', {})
})

app.post('/v/add', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const quickView = db.QuickView.build({
    UserId: req.user.id,
    name: req.body.name,
    tags: req.body.tags
  })
  
  await quickView.save()

  res.redirect('/')
}))

app.get('/v/:id', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const quickView = await db.QuickView.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  const bookmarks = await req.user.getBookmarks()
  
  // TODO
  const b = filterForQuickView(quickView, bookmarks)
  res.renderWithContext('index', { bookmarks: b, quickView: true })
}))

app.get('/v/:id/edit', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const quickView = await db.QuickView.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  res.renderWithContext('editQuickView', { quickView })
}))

app.post('/v/:id/edit', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const quickView = await db.QuickView.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })

  quickView.name = req.body.name
  quickView.tags = req.body.tags
  
  await quickView.save()
  
  res.redirect('/settings')
}))

app.get('/v/:id/delete', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const quickView = await db.QuickView.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })

  res.renderWithContext('deleteQuickView', { quickView })
}))

app.post('/v/:id/delete', auth.isLoggedIn, asyncHandler(async (req, res) => {
  const quickView = await db.QuickView.findOne({
    where: { UserId: req.user.id, id: req.params.id },
    rejectOnEmpty: true
  })
  
  await quickView.destroy()
  
  res.redirect('/settings')
}))


app.get('/web-page-title/:url', auth.isLoggedIn, (req, res) => {
  fetch(req.params.url)
    .then(response => response.text())
    .then(html => {
      const result = html.match(/<title[^>]*>([^<]+)<\/title>/)
      
      res.send(result ? result[1] : null)
    })
    .catch(error => {
      res.sendStatus(404)
    })
})


app.get('/settings', auth.isLoggedIn, (req, res) => {
  res.renderWithContext('settings', {})
})

app.listen(port, () => console.log(`listening on ${port}`))
