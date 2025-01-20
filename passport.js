require('dotenv').config()
const express = require('express')
const session = require('express-session')
const passport = require('passport')
const FacebookStrategy = require('passport-facebook')
const {Firestore} = require('@google-cloud/firestore')
const dateFns = require('date-fns')
const {TokensStore} = require('./lib/tokens-store')
const app = express()
const port = process.env.PORT || 8000

const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
if (!APP_ID || !APP_SECRET) throw new Error('Missing necessary app info in .env')
const REDIRECT_URL = process.env.REDIRECT_URL || 'http://localhost:8000/auth/callback'
const PERMISSIONS = process.env.PERMISSIONS || 'public_profile,read_insights,business_management,ads_read,pages_read_engagement'

console.log(`https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}&state=%7Bstate-param%7D&scope=${PERMISSIONS}`)

const firestore = new Firestore()

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
const createFetchGraphApi = (accessToken) => (fragment, params) => fetchGraphApi(fragment, accessToken, params)

passport.initialize({ userProperty: 'profile' })
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
passport.use(new FacebookStrategy({
	clientID: APP_ID,
	clientSecret: APP_SECRET,
	callbackURL: REDIRECT_URL,
	scope: PERMISSIONS.split(','),
}, async (accessToken, refreshToken, profile, cb) => {
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

	const f = createFetchGraphApi(longLivedToken)

	const me = await f('/me')
	console.log('me', JSON.stringify(me))

	const userId = me.id
	
	const tokensStore = new TokensStore(firestore, 'facebook')
	await tokensStore.saveToken(userId, APP_ID, longLivedToken, PERMISSIONS.split(','))

	const businesses = await f('/me/businesses')
	console.log('businesses', JSON.stringify(businesses))

	const businesAccounts = businesses.data || []

	const businessAdAccounts = await Promise.all(businesAccounts.map(async (businessAccount) => {
		const businessAdAccounts = await f(`/${businessAccount.id}/owned_ad_accounts`)
		console.log('businessAdAccounts', businessAccount.id, JSON.stringify(businessAdAccounts.data))
		return { businessAccountId: businessAccount.id, businessAdAccounts: businessAdAccounts.data }
	}))
	console.log('all businessAdAccounts', JSON.stringify(businessAdAccounts))



	// #region creatives taken from ads-insights
	const adAccounts = await f('/me/adaccounts', {fields: ['id', 'name']})
	console.log('adAccounts'); console.dir(adAccounts, {depth: null})
	const adAccountAds = await Promise.all(adAccounts.data.map(async (adAccount) => {
		const adAccountId = adAccount.id
		const ads = await f(`/${adAccount.id}/ads`, {fields:['id', 'name', 'ad_account_id']})
		return {adAccountId, ads}
	}))
	console.log('adAccountAds'); console.dir(adAccountAds, {depth: null})
	const creatives = await Promise.all(adAccountAds.map(async ({adAccountId, ads}) => Promise.all(ads.data.map(async (ad) => {
		const adId = ad.id
		const creative = await f(`/${adId}/`, {fields: ['id', 'name', 'creative']})
		const creativeId = creative.creative.id
		const creativeDetail = await f(`/${creativeId}/`, {fields: ['id', 'name', 'object_type', 'object_url', 'image_url', 'link_url', 'video_id']})
		if (creativeDetail.object_type === 'VIDEO') {
			const videoInsights = await f(`/${creativeDetail.video_id}/`, {fields: ['video_insights', 'post_id', 'collaborators', 'permalink_url']})
			return {adAccountId, adId, creativeId, creativeDetail, videoInsights}
		}
		return {adAccountId, adId, creativeId, creativeDetail}
	}))))
	console.log('creatives'); console.dir(creatives, {depth: null})
	// #endregion creatives taken from ads-insights


	// #region insights
	const insights = await Promise.all(adAccountAds.map(async ({adAccountId, ads}) => Promise.all(ads.data.map(async (ad) => {
		const adId = ad.id
		const totalInsights = await f(`/${adId}/insights`, {fields: ['ad_id', 'spend', 'impressions', 'reach']})
		
		const minStart = Math.min(totalInsights.data.map(({date_start}) => new Date(date_start).getTime()))
		const maxStop = Math.max(totalInsights.data.map(({date_stop}) => new Date(date_stop).getTime()))
		const dateFormat = 'yyyy-MM-dd'
		const dailyInsights = await f(`/${adId}/insights`, {
			fields: ['ad_id', 'spend', 'impressions', 'reach'], 
			time_range: JSON.stringify({since: dateFns.format(minStart, dateFormat), until: dateFns.format(maxStop, dateFormat)}), 
			time_increment: 1,	// yay, this param is responsible for the daily breakdown
		})
			
		return {adAccountId, adId, totalInsights, dailyInsights}
	}))))
	console.log('insights'); console.dir(insights, {depth: null})
	// #endregion insights



	return cb(null, {profile: profile._json, data: {creatives, insights}})
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
		res.json(req.user.data)
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
