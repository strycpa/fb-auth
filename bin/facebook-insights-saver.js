import 'dotenv/config'
import { Firestore } from '@google-cloud/firestore'
import { writeFile } from 'fs/promises'

import config from '../config.js'
import { TokensRepository } from '../src/repository/facebook-tokens-repository.js'
import { createFetchGraphApi } from '../src/remote/facebook-remote.js'
import { paralellize } from '../lib/utils.js'
import zodSchemas from '../lib/zod-shemas.js'
import bigQuery from '../lib/bigquery.js'

const AD_ACCOUNT_SOURCES = {
	'personal': 'personal',
	'business': 'business',
}

const PERIODS = {
	'daily': 'daily',
	'lifetime': 'lifetime',
}

const BREAKDOWNS = [
	['age', 'gender'],
	['country', 'region']
]

const APP_ID = process.env.APP_ID
const USER_ID = '10235767919166237'

const firestore = new Firestore()
const tokensRepository = new TokensRepository(firestore, 'facebook')

try {
	const token = await tokensRepository.fetchToken(USER_ID, APP_ID)
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

	const fetchAdInsights = async (adId, period, breakdowns) => {
		const metrics = Object.keys(zodSchemas.metrics)
		const payload = {
			fields: metrics, 
			breakdowns,
		}
		if (period === PERIODS.daily) {
			payload.time_increment = 1
		}
		return fetchGraphApi(`/${adId}/insights`, payload)
	}

	const adAccounts = await fetchAdAccounts(AD_ACCOUNT_SOURCES.personal)
	console.log('adAccounts'); console.dir(adAccounts, {depth: null})

	const ads = (await paralellize(adAccounts, ({id}) => fetchGraphApi(`/${id}/ads`, {fields: ['ad_id', 'account_id']}))).flat()	// one unnecesasry extra call that allows us to paralellize more effectively all the breakdowns - we need the ad ids
	console.log('ads'); console.dir(ads, {depth: null})
	
	const brokenDownInsights = (await 
		paralellize(Object.keys(PERIODS), async (period) => 
			paralellize(BREAKDOWNS, async (breakdowns) => 
				paralellize(ads, async (ad) => {
					return {
						user_id: USER_ID,
						ad_account_id: ad.account_id,
						ad_id: ad.id,
						period,
						breakdowns,
						insights: await fetchAdInsights(ad.id, period, breakdowns)
					}
				}
	)))).flat().flat().flat().flat()
	console.log('brokenDownInsights'); console.dir(brokenDownInsights, {depth: null})
	
	await writeFile('brokenDownInsights', JSON.stringify(brokenDownInsights, null, 2))

	const tables = {}
	await Promise.all(brokenDownInsights.map(async (data) => {
		const {breakdowns, period} = data
		const breakdownName = breakdowns.join('_')
		const tableName = `facebook_ads_insights_${period}_${breakdownName}`
		if (!tables[tableName]) {
			const fullyQualifiedTableName = `${config.projectId}.facebook_ads_insights.${tableName}`
			const schema = zodSchemas.schemas[tableName]
			const table = await bigQuery.getTable(fullyQualifiedTableName, schema)
			tables[tableName] = table
		}
		const table = tables[tableName]
		await table.insert(data)
	}))
} catch (error) {
	console.error('Error:', error)
	process.exit(1)
}