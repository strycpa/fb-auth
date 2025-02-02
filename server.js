import 'dotenv/config'
import express from 'express'
import path from 'path'
import session from 'express-session'
import { TokensRepository } from './src/repository/facebook-tokens-repository.js'
import { Firestore } from '@google-cloud/firestore'
import { CloudTasksClient } from '@google-cloud/tasks'
import FacebookRemote from './src/remote/facebook-remote.js'
import FacebookTokensService from './src/service/facebook-tokens-service.js'
import FacebookAdsInsightsSaverService from './src/service/facebook-ads-insights-saver-service.js'
import { config } from './config.js'
import { metricNames } from './lib/zod-schemas.js'
import TasksService from './src/service/tasks-service.js'

const app = express()
const PORT = process.env.PORT || 3000

// Add JSON body parser middleware
app.use(express.json())

// @todo strycp come up with some DI, this is getting out of hand
const firestore = new Firestore()
const tokensRepository = new TokensRepository(firestore, 'facebook')

const facebookRemote = new FacebookRemote()
const facebookTokensService = new FacebookTokensService(facebookRemote, tokensRepository)

const facebookAdsInsightsSaverService = new FacebookAdsInsightsSaverService(facebookRemote, facebookTokensService)

const client = new CloudTasksClient()

const tasksService = new TasksService(client, tokensRepository, facebookRemote, config)

app.use(session({
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: true
}))

app.set('views', './views')
app.set('view engine', 'ejs')

// #region frontend

app.get('/', (req, res) => {
	res.render('index', { 
		appId: config.facebook.APP_ID,
		scope: 'public_profile,read_insights,business_management,ads_read,pages_read_engagement'
	});
})

app.get('/auth/callback', async (req, res) => {
	const { access_token } = req.query

	if (!access_token) {
		return res.status(400).send('Access token is missing')
	}

	try {
		const longLivedToken = await facebookTokensService.exchangeLongLivedToken(access_token)

		const me = await facebookTokensService.storeToken(config.facebook.APP_ID, longLivedToken)

		// Store user metadata in session
		req.session.user = me

		 // Redirect to /ad-accounts
		res.redirect('/ad-accounts')
	} catch (error) {
		console.error('Error during authentication callback:', error)
		res.status(500).send('Internal Server Error')
	}
})

app.get('/ad-accounts', async (req, res) => {
	if (!req.session.user) {
		return res.redirect('/')
	}

	try {
		const token = await tokensRepository.fetchToken(config.facebook.APP_ID, req.session.user.id)
		
		const [personalAccounts, businessAccounts] = await Promise.all([
			facebookAdsInsightsSaverService.fetchPersonalAdaccounts(token.access_token),
			facebookAdsInsightsSaverService.fetchBusinessAdaccounts(token.access_token)
		])

		res.render('ad-accounts', { 
			personalAccounts,
			businessAccounts
		})
	} catch (error) {
		console.error('Error fetching ad accounts:', error)
		res.status(500).send('Internal Server Error')
	}
})

app.get('/ads-insights', async (req, res) => {
	if (!req.session.user) {
		return res.redirect('/')
	}

	const selectedAccounts = req.query.accounts
	if (!selectedAccounts) {
		return res.redirect('/ad-accounts')
	}

	try {
		const token = await tokensRepository.fetchToken(config.facebook.APP_ID, req.session.user.id)
		const accountIds = Array.isArray(selectedAccounts) ? selectedAccounts : [selectedAccounts]
		const selectedAdAccounts = accountIds.map(id => ({ id }))
		
		const allAdsWithMetrics = await facebookAdsInsightsSaverService.fetchAllAdsWithMetrics(selectedAdAccounts, token.access_token)
		console.log('allAdsWithMetrics'); console.dir(allAdsWithMetrics, {depth: null})
		
		const metrics = Object.keys(allAdsWithMetrics[0] || {})

		res.render('ads-insights', { 
			adsData: allAdsWithMetrics, 
			metrics, 
			metricNames,
		})
	} catch (error) {
		console.error('Error fetching ads insights:', error)
		res.status(500).send('Internal Server Error')
	}
})

// #endregion frontend

// #region api
app.post('/api/task/create', async (req, res) => {
	try {
		const {accountIds} = req.body	// choked here, only accountIds are passed
		const response = await tasksService.createTask(accountIds)
		res.json({
			success: true,
			taskName: response.name,
		})
	} catch (error) {
		console.error('Error creating task:', error)
		res.status(500).json({
			success: false,
			error: 'Failed to create task'
		})
	}
})

app.post('/api/task/process', async (req, res) => {
	try {
		await tasksService.processTask(req.body.accountIds)
		res.json({
			success: true,
			message: 'Task processed successfully'
		})
	} catch (error) {
		console.error('Error processing task:', error)
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to process task'
		})
	}
})
// #endregion api

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`)
})
