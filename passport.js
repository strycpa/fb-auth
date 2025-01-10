require('dotenv').config()
const express = require('express')
const session = require('express-session')
const passport = require('passport')
const FacebookStrategy = require('passport-facebook')
const {Firestore} = require('@google-cloud/firestore')
const app = express()
const port = process.env.PORT || 8000

const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
if (!APP_ID || !APP_SECRET) throw new Error('Missing necessary app info in .env')
const REDIRECT_URL = process.env.REDIRECT_URL || 'http://localhost:8000/auth/callback'
const PERMISSIONS = process.env.PERMISSIONS || 'public_profile,read_insights,business_management,ads_read'

console.log(`https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}&state=%7Bstate-param%7D&scope=${PERMISSIONS}`)

const firestore = new Firestore()
const tokensFacebookCollection = firestore.collection('tokens_facebook')

const fetchGraphApi = async (fragment, accessToken, params = {}) => {
	const fetchUrl = new URL(`https://graph.facebook.com/v21.0${fragment}`)
	fetchUrl.search = new URLSearchParams({
		access_token: accessToken,
		...params
	}).toString()
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		console.error(`Fetch failed with status: ${response.status}`)
	}
	return response.json()
}

passport.initialize({ userProperty: 'profile' })
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
passport.use(new FacebookStrategy({
	clientID: APP_ID,
	clientSecret: APP_SECRET,
	callbackURL: REDIRECT_URL,
	scope: PERMISSIONS.split(','),
}, async (accessToken, refreshToken, profile, cb) => {
	const NOW = new Date()

	console.log('accessToken', accessToken)
	console.log('refreshToken', refreshToken)
	console.log('profile', JSON.stringify(profile))

	const { access_token: longLivedToken } = await fetchGraphApi('/oauth/access_token', accessToken, {
		grant_type: 'fb_exchange_token',
		client_id: APP_ID,
		client_secret: APP_SECRET,
		fb_exchange_token: accessToken,
	})
	console.log('longLivedToken', longLivedToken)

	const me = await fetchGraphApi('/me', longLivedToken)
	console.log('me', JSON.stringify(me))

	const userId = me.id
	
	const existingTokens = await tokensFacebookCollection.where('user_id', '==', userId).limit(1).get()
	if (existingTokens.empty) {
		console.log('storing a new token to firestore')
		await tokensFacebookCollection.add({
			access_token: longLivedToken,
			user_id: userId,
			app_id: APP_ID,
			permissions: PERMISSIONS.split(','),
			created_at: NOW,
		})
	} else {
		console.log('updating an existing token already stored in firestore')
		await existingTokens.forEach((existingToken) => {
			existingToken.ref.update({
				access_token: longLivedToken,
				app_id: APP_ID,
				permissions: PERMISSIONS.split(','),
				updated_at: NOW,
			})
		})
	}

	const businesses = await fetchGraphApi('/me/businesses', longLivedToken)
	console.log('businesses', JSON.stringify(businesses))

	const businesAccounts = businesses.data || []

	const adAccounts = await Promise.all(businesAccounts.map(async (businessAccount) => {
		const adAccounts = await fetchGraphApi(`/${businessAccount.id}/owned_ad_accounts`, longLivedToken)
		console.log('adAccounts', businessAccount.id, JSON.stringify(adAccounts.data))
		return { businessAccountId: businessAccount.id, adAccounts: adAccounts.data }
	}))
	console.log('all adAccounts', JSON.stringify(adAccounts))

	return cb(null, profile._json)
}))

app.use(session({
	secret: 'keyboard cat',
	resave: false,
	saveUninitialized: true,
	cookie: { secure: false }
}))
app.use(passport.session());
app.use(passport.initialize());

app.get('/', (req, res) => {
	if (req.user) {
		res.end('Thank you for connecting with us')
	} else {
		res.redirect('/auth')
	}
})
app.get('/auth', passport.authenticate('facebook'))
app.get(
	'/auth/callback',
	passport.authenticate('facebook', { failureRedirect: '/auth', failureMessage: true }),
	(req, res) => res.redirect('/')
);


app.listen(port, () => console.log(`listening on port ${port}`)) 
