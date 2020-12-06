import fs from 'fs';
import https, { ServerOptions as HttpsServerOptions } from 'https';
import http from 'http';
import axios from 'axios';
import express from 'express';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import session from 'cookie-session';
import { Strategy as BnetStrategy } from 'passport-bnet';
import { AddressInfo } from 'net';
import { config } from 'dotenv';
import { getData, readExistingFile } from './helpers/read-file';

config()

const ENV = process.env.ENV
const BNET_ID = process.env.BNET_ID
const BNET_SECRET = process.env.BNET_SECRET
const BNET_API_URL = process.env.BNET_API_URL
const BNET_NAMESPACE = process.env.BNET_NAMESPACE
const REALM_SLUG = process.env.REALM_SLUG
const GUILD_SLUG = process.env.GUILD_SLUG
const PORT = process.env.PORT
const APP_URL = process.env.APP_URL

let credentials;

if (ENV === 'dev') {
  const key = fs.readFileSync('sslcert/key.pem')
  const cert = fs.readFileSync('sslcert/cert.pem')
  credentials = { key: key, cert: cert }
}

passport.serializeUser((user: unknown, done: any) => {
  done(null, user)
})

passport.deserializeUser((obj: unknown, done: any) => {
  done(null, obj)
})

// Use the BnetStrategy within Passport.
passport.use(
  new BnetStrategy(
    {
      clientID: BNET_ID,
      clientSecret: BNET_SECRET,
      region: 'eu',
      scope: 'wow.profile sc2.profile',
      callbackURL: `${APP_URL}/auth/bnet/callback`
    },
    (accessToken: string, refreshToken: string, profile: unknown, done: any) => {
      process.nextTick(function () {
        return done(null, profile)
      })
    })
)

const app = express()

// configure Express
app.use(cookieParser())
app.use(session({
  secret: 'blizzard',
}))

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize())
app.use(passport.session())

app.get('/auth/bnet',
  passport.authenticate('bnet'))

app.get('/auth/bnet/callback',
  passport.authenticate('bnet', { failureRedirect: '/borked' }),
  (req, res) => {
    res.redirect('/guild-roster')
  })

app.get('/guild', async (req, res) => {
  if (req.isAuthenticated()) {
    const guildData: any = readExistingFile('data/guildData.json');

    // @ts-ignore
    const token: string = req.user.token;

    if (guildData) {
      const guildQuery = `${BNET_API_URL}/data/wow/guild/${REALM_SLUG}/${GUILD_SLUG}?namespace=${BNET_NAMESPACE}&locale=en_US&access_token=${token}`
      const guildData: any = await getData(guildQuery, token, res)

      fs.writeFile('data/guildData.json', JSON.stringify(guildData), () => {})
    }

    res.json(guildData)
  } else {
    res.redirect('/auth/bnet')
  }
})

app.get('/guild-roster', async (req, res) => {
  if (req.isAuthenticated()) {
    let guildRosterData: any = readExistingFile('data/guildRosterData.json');
    // @ts-ignore
    const token: string = req.user.token;

    if (!guildRosterData) {
      const guildRosterQuery = `${BNET_API_URL}/data/wow/guild/${REALM_SLUG}/${GUILD_SLUG}/roster?namespace=${BNET_NAMESPACE}`
      guildRosterData = await getData(guildRosterQuery, token, res)

      fs.writeFile('data/guildRosterData.json', JSON.stringify(guildRosterData), () => {})
    }

    const urls = guildRosterData.members
      .filter(({ character }: any) => (character.level === 60))
      .map(({ character }: any) => character.key.href)


    Promise.all(urls.map(async (charUrl: string) => {
      const response = await axios({
        method: 'get',
        url: charUrl,
        headers: { Authorization: 'Bearer ' + token }
      })

      const { name, realm } = response.data;
      fs.writeFile(`data/characters/${realm.slug}-${name.toLowerCase()}.json`, JSON.stringify(response.data), () => {})

      return response.data;
    }))

    res.json(guildRosterData)
  } else {
    res.redirect('/auth/bnet')
  }
})

app.get('/borked', async (req, res) => {
  res.json({error: 'something on bnet is borked'})
})

app.get('/logout', function (req, res) {
  req.logout()
  res.redirect('/')
})

if (ENV === 'dev') {
  const httpsServer = https.createServer((credentials as HttpsServerOptions), app)

  httpsServer.listen(PORT, () => {
    console.log('httpsServer Listening on port %d', (httpsServer.address() as AddressInfo).port)
  })
} else {
  const httpServer = http.createServer()

  httpServer.listen(PORT, () => {
    console.log('httpServer Listening on port %d', (httpServer.address() as AddressInfo).port)
  })
}
