require('dotenv').config()
const express = require('express')
const passport = require('passport')
const FacebookStrategy = require('passport-facebook')
const app = express()
const port = process.env.PORT || 8000

const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
if (!APP_ID || !APP_SECRET) throw new Error('Missing necessary app info in .env')
const REDIRECT_URL = process.env.REDIRECT_URL || 'http://localhost:8000/auth/callback'
const PERMISSIONS = process.env.PERMISSIONS || 'public_profile,read_insights,business_management,ads_read'

console.log(`https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}&state=%7Bstate-param%7D&scope=${PERMISSIONS}`)

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

passport.use(new FacebookStrategy({
	clientID: APP_ID,
	clientSecret: APP_SECRET,
	callbackURL: REDIRECT_URL,
	scope: PERMISSIONS.split(','),
}, async (accessToken, refreshToken, profile, cb) => {

	console.log('accessToken', accessToken)
	console.log('refreshToken', refreshToken)
	console.log('profile', JSON.stringify(profile))

	const {access_token: longLivedToken} = await fetchGraphApi('/oauth/access_token', accessToken, {
		grant_type: 'fb_exchange_token',
		client_id: APP_ID,
		client_secret: APP_SECRET,
		fb_exchange_token: accessToken,
	})
	console.log('longLivedToken', longLivedToken)

	const pages = await fetchGraphApi('/me/ ', longLivedToken)
	console.log('pages', JSON.stringify(pages))

	const businesses = await fetchGraphApi('/me/businesses', longLivedToken)
	console.log('businesses', JSON.stringify(businesses))

	const businesAccounts = businesses.data || []

	const adAccounts = await Promise.all(businesAccounts.map(async (businessAccount) => {
		const adAccounts = await fetchGraphApi(`/${businessAccount.id}/owned_ad_accounts`, longLivedToken)
		console.log('adAccounts', businessAccount.id, JSON.stringify(adAccounts.data))
		return {businessAccountId: businessAccount.id, adAccounts: adAccounts.data}
	}))
	console.log('all adAccounts', JSON.stringify(adAccounts))

	return cb()
}))

app.get('/auth', passport.authenticate('facebook'))

app.get('/auth/failure', (req, res) => {
	console.log('/auth/failure', req.session.messages)
	res.end()
})

app.get('/auth/callback', (req, res, next) => {
	console.log('/auth/callback 1', req.query)
	next()
}, passport.authenticate('facebook', { failureRedirect: '/auth', failureMessage: true }), (req, res) => {
	console.log('/auth/callback 2', req.session.messages)
	res.send('Thank you for the token.')
})

app.listen(port, () => console.log(`listening on port ${port}`)) 
