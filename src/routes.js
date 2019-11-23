import express from 'express'

import {
  restaurants,
  parseOrders,
  parseOrdersNamed,
  getMenu,
  getAllMenus,
  parseTodaysPrestoMenu,
  parseTodaysVeglifeMenu,
  parseTodaysClickMenu,
} from './utils'
import { notifyAllThatOrdered, changeMute } from './slack'
import { logger } from './resources'
import config from '../config'
import { listRecords } from './airtable'

async function renderOrders(req, res) {
  const { presto, veglife, click, shop } = await parseOrders()

  res.render('index', {
    title: 'Dnešné objednávky',
    activePage: 'index',
    presto,
    veglife,
    click,
    shop,
  })
}

async function renderOrdersNamed(req, res) {
  const allOrders = await parseOrdersNamed()

  res.render('namedOrders', {
    title: 'Objednávky s menami',
    activePage: 'named',
    allOrders,
  })
}

async function renderNotifications(req, res) {
  const users = await listRecords()
  res.render('notifications', {
    title: 'Stav notifikácií',
    activePage: 'notifications',
    users,
  })
}

export function startExpress() {
  const app = express()
  const port = config.port

  app.set('view engine', 'pug')
  app.use('/public', express.static('public'))

  app.get('/', renderOrders)
  app.get('/named', renderOrdersNamed)

  app.get('/notifications', renderNotifications)

  // notification messages that food has arrived or won't arrive
  app.get('/veglife', (req, res) => {
    notifyAllThatOrdered(restaurants.veglife, true)
    res.redirect('/')
  })

  app.get('/noveglife', (req, res) => {
    notifyAllThatOrdered(restaurants.veglife, false)
    res.redirect('/')
  })

  app.get('/presto', (req, res) => {
    notifyAllThatOrdered(restaurants.presto, true)
    res.redirect('/')
  })

  app.get('/nopresto', (req, res) => {
    notifyAllThatOrdered(restaurants.presto, false)
    res.redirect('/')
  })

  app.get('/click', (req, res) => {
    notifyAllThatOrdered(restaurants.click, true)
    res.redirect('/')
  })

  app.get('/noclick', (req, res) => {
    notifyAllThatOrdered(restaurants.click, false)
    res.redirect('/')
  })

  app.get('/mute', (req, res) => {
    changeMute(req.query.channel, false).then(() =>
      res.redirect('/notifications'),
    )
  })

  app.get('/unmute', (req, res) => {
    changeMute(req.query.channel, true).then(() =>
      res.redirect('/notifications'),
    )
  })

  // menu responses for slash commands
  app.post('/menupresto', async (req, res) => {
    const menu = await getMenu(config.menuLinks.presto, parseTodaysPrestoMenu)
    res.status(200).send(menu)
  })

  app.post('/menuveglife', async (req, res) => {
    const menu = await getMenu(config.menuLinks.veglife, parseTodaysVeglifeMenu)
    res.status(200).send(menu)
  })

  app.post('/menuclick', async (req, res) => {
    const menu = await getMenu(config.menuLinks.click, parseTodaysClickMenu)
    res.status(200).send(menu)
  })

  app.post('/menus', async (req, res) => {
    res.status(200).send(await getAllMenus())
  })

  app.post('/help', (req, res) => {
    res.send(config.messages.help)
  })

  app.listen(port, () => {
    logger.log('Server started on http://localhost:' + port)
  })
}
