require('dotenv').config()
const express = require('express')
const passport = require('passport')
const FacebookStrategy = require('passport-facebook')
const app = express()
const port = 8000

const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
if (!APP_ID || !APP_SECRET) throw new Error('Missing necessary app info in .env')
const REDIRECT_URL = 'http://localhost:8000/auth/callback'
const PERMISSIONS = ['public_profile', 'read_insights', 'pages_show_list']

const ADS_LIBRARY_SEARCH = 'Solomon - koření králů'
const ADS_LIBRARY_REACHED_COUNTRIES = ['CZ']

console.log(`https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}&state=%7Bstate-param%7D&scope=${PERMISSIONS.join(',')}`)

const fetchGraphApi = async (fragment, accessToken, params = {}) => {
	const fetchUrl = new URL(`https://graph.facebook.com/v21.0${fragment}`)
	fetchUrl.search = new URLSearchParams({
		access_token: accessToken,
		...params
	}).toString()
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		console.error(await response.json())
		throw new Error(`Fetch failed with status: ${response.status}`)
	}
	return response.json()
}

passport.initialize({ userProperty: 'profile' })

passport.use(new FacebookStrategy({
	clientID: APP_ID,
	clientSecret: APP_SECRET,
	callbackURL: REDIRECT_URL,
	scope: PERMISSIONS,
}, async (accessToken, refreshToken, profile, cb) => {

	console.log('accessToken', accessToken)
	console.log('refreshToken', refreshToken)
	console.log('profile', profile)

	const {access_token: longLivedToken} = await fetchGraphApi('/oauth/access_token', accessToken, {
		grant_type: 'fb_exchange_token',
		client_id: APP_ID,
		client_secret: APP_SECRET,
		fb_exchange_token: accessToken,
	})
	console.log('longLivedToken', longLivedToken)

	const pages = await fetchGraphApi('/me/accounts', longLivedToken)
	console.log('pages', pages)

	const adAccounts = await fetchGraphApi('/me/adaccounts', longLivedToken)
	console.log('adAccounts', adAccounts)

	const allAdAccounts = adAccounts.data // fck paging for now

	console.log('alladaccounts', allAdAccounts)
	const ads = await Promise.all(allAdAccounts.map(async (adAccount) => {
		const ads = await fetchGraphApi(`/${adAccount.id}/ads`, longLivedToken)
		console.log('ads', adAccount.id, ads.data)
		return {adAccountId: adAccount.id, ads: ads.data}
	}))
	console.log('all ads', ads)

	const adsLibrary = await fetchGraphApi('/ads_archive', longLivedToken, {
		search_terms: ADS_LIBRARY_SEARCH,
		ad_reached_countries: ADS_LIBRARY_REACHED_COUNTRIES,
	})
	console.log('ads library', adsLibrary)

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
