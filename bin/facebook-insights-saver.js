require('dotenv').config()

const {Firestore} = require('@google-cloud/firestore')
const {TokensStore} = require('../lib/tokens-store')
const {createFetchGraphApi} = require('../src/remote/facebook-remote')
const {paralellize} = require('../lib/utils')
const {metrics} = require('../lib/const/metrics')

const AD_ACCOUNT_SOURCES = {
	'personal': 'personal',
	'business': 'business',
}

const BREAKDOWNS = [
	['age', 'gender'],
	['country', 'region']
]

const APP_ID = process.env.APP_ID
const USER_ID = '10235767919166237'

const firestore = new Firestore()
const tokensStore = new TokensStore(firestore, 'facebook')

;(async () => {
	const token = await tokensStore.fetchToken(USER_ID, APP_ID)
	const fetchGraphApi = createFetchGraphApi(token.access_token)

	const fetchAdAccounts = async (source) => {
		switch (source) {
			case AD_ACCOUNT_SOURCES.personal:
				return fetchGraphApi('/me/adaccounts')
			case AD_ACCOUNT_SOURCES.business:
				const businesses = await fetchGraphApi('/me/businesses')
				return paralellize(businesses, ({id}) => fetchGraphApi(`/${id}/owned_ad_accounts`))
			default:
				throw new Error(`Unknown ad accounts source ${source}`)
		}
	}

	const adAccounts = await fetchAdAccounts(AD_ACCOUNT_SOURCES.personal)
	console.log('adAccounts'); console.dir(adAccounts, {depth: null})
	const ads = (await paralellize(adAccounts, ({id}) => fetchGraphApi(`/${id}/ads`, {
		fields: ['ad_id', 'account_id', `insights{${metrics.facebook.ads.insights.join(',')}}`]
	}))).flat()
	console.log('ads'); console.dir(ads, {depth: null})
	const dailyAds = (await paralellize(ads, ({id}) => fetchGraphApi(`/${id}/insights`, {
		fields: ['ad_id', 'account_id', ...metrics.facebook.ads.insights], 
		time_increment: 1,
	}))).flat()
	console.log('dailyAds'); console.dir(dailyAds, {depth: null})
	
	// paralellize(['lifetime', 'daily'], (period) => paralellize(BREAKDOWNS, (breakdown) => fetchInsights(period, breakdown)))
})()