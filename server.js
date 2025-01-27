require('dotenv').config()
const express = require('express')
const path = require('path')
const session = require('express-session')
const { TokensStore } = require('./lib/tokens-store')
const { Firestore } = require('@google-cloud/firestore')
const { fetchGraphApi, createFetchGraphApi } = require('./src/remote/facebook-remote')
const app = express()
const PORT = process.env.PORT || 3000

const firestore = new Firestore()
const tokensStore = new TokensStore(firestore, 'facebook')

app.use(session({
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: true
}))

app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.get('/config', (req, res) => {
	res.json({ appId: process.env.APP_ID })
})

app.get('/auth/callback', async (req, res) => {
	const { access_token } = req.query

	if (!access_token) {
		return res.status(400).send('Access token is missing')
	}

	try {
		// Exchange short-lived token for long-lived token
		const longLivedTokenResponse = await fetchGraphApi('/oauth/access_token', access_token, {
			grant_type: 'fb_exchange_token',
			client_id: process.env.APP_ID,
			client_secret: process.env.APP_SECRET,
			fb_exchange_token: access_token,
		})
		const longLivedToken = longLivedTokenResponse.access_token

		const f = createFetchGraphApi(longLivedToken)
		const [ me, permissions ] = await Promise.all([
			f('/me'),
			f('/me/permissions'),
		])

		// Store long-lived token to Firestore using TokensStore
		await tokensStore.saveToken(me.id, process.env.APP_ID, {
			access_token: longLivedToken, 
			permissions: permissions.data.map((o) => o.permission),
			comment: me.name
		})

		// Store user metadata in session
		req.session.user = me

		 // Redirect to /ads-insights
		res.redirect('/ads-insights')
	} catch (error) {
		console.error('Error during authentication callback:', error)
		res.status(500).send('Internal Server Error')
	}
})

// New route to display ads insights
app.get('/ads-insights', async (req, res) => {
	if (!req.session.user) {
		return res.redirect('/')
	}

	const longLivedToken = await tokensStore.fetchToken(req.session.user.id, process.env.APP_ID)
	const f = createFetchGraphApi(longLivedToken.access_token)

	try {
		// Fetch user's ad accounts
		const [ adAccounts, businessAccounts ] = await Promise.all([
			f('/me/adaccounts', { fields: ['id', 'name'] }),
			f('/me/businesses'),
		])
		const businessAdAccounts = await Promise.all(businessAccounts.map(async (business) => {
			return f(`/${business.id}/owned_ad_accounts`, { fields: ['id', 'name'] })
		}))

		const allAdAccounts = [...adAccounts, ...businessAdAccounts.flat()]

		// Fetch ads and their metrics
		const adsData = await Promise.all(allAdAccounts.map(async (account) => {
			const ads = await f(`/${account.id}/ads`, { fields: ['id', 'name', 'adcreatives', 'insights'] })
			return ads.map(ad => ({
				accountName: account.name,
				adId: ad.id,
				adName: ad.name,
				creative: ad.adcreatives.data[0],
				insights: ad.insights.data[0]
			}))
		}))

		// Render ads data using the template
		res.render('ads-insights', { adsData: adsData.flat() })
	} catch (error) {
		console.error('Error fetching ads insights:', error)
		res.status(500).send('Internal Server Error')
	}
})

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`)
})
