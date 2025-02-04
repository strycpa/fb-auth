import { randomUUID } from 'crypto'
import zodSchemas from '../../lib/zod-schemas.js'
import { PERIODS } from '../../lib/const/periods.js'
import { BREAKDOWNS } from '../../lib/const/breakdowns.js'
import { paralellize, chunkArray } from '../../lib/utils.js'
import { getTable } from '../../lib/bigquery.js'
import { config } from '../../config.js'

export default class FacebookAdsInsightsSaverService {

	/**
	 * @param {import('../remote/facebook-remote.js').default} facebookRemote - The Facebook remote service
	 * @param {import('./facebook-tokens-service.js').default} tokenService - The token service
	 */
	constructor(facebookRemote, tokenService) {
		this.facebookRemote = facebookRemote
		this.tokenService = tokenService
	}

	static AD_ACCOUNT_SOURCE = {
		PERSONAL: 'personal',
		BUSINESS: 'business'
	}

	async _fetchAdAccountsBySource(accessToken, source) {
		const fields = ['id', 'name']
		switch (source) {
			case FacebookAdsInsightsSaverService.AD_ACCOUNT_SOURCE.PERSONAL:
				return this.facebookRemote.fetchGraphApi('/me/adaccounts', accessToken, {fields})
			case FacebookAdsInsightsSaverService.AD_ACCOUNT_SOURCE.BUSINESS:
				const businesses = await this.facebookRemote.fetchGraphApi('/me/businesses', accessToken, {fields})
				return (await paralellize(businesses, async (business) => {
					const adAccounts = await this.facebookRemote.fetchGraphApi(`/${business.id}/owned_ad_accounts`, accessToken, {fields})
					return adAccounts.map((adAccount) => ({...adAccount, business}))
				})).flat()
			default:
				throw new Error(`Unknown ad accounts source ${source}`)
		}
	}

	async fetchPersonalAdaccounts (accessToken) {
		return this._fetchAdAccountsBySource(accessToken, FacebookAdsInsightsSaverService.AD_ACCOUNT_SOURCE.PERSONAL)
	}

	async fetchBusinessAdaccounts (accessToken) {
		return this._fetchAdAccountsBySource(accessToken, FacebookAdsInsightsSaverService.AD_ACCOUNT_SOURCE.BUSINESS)
	}

	async fetchAllAdaccounts (accessToken) {
		const [personalAdAccounts, businessAdAccounts] = await Promise.all([
			this.fetchPersonalAdaccounts(accessToken),
			this.fetchBusinessAdaccounts(accessToken)
		])
		return [...personalAdAccounts, ...businessAdAccounts]
	}

	async fetchAdInsights (accessToken, adId, period, breakdowns, metrics) {
		const payload = {
			fields: metrics, 
			breakdowns,
		}
		if (period === PERIODS.daily) {
			payload.time_increment = 1
		}
		return this.facebookRemote.fetchGraphApi(`/${adId}/insights`, accessToken, payload)
	}

	/**
	 * Fetches all ads and their associated metrics for given ad accounts in all the used breakdowns and periods
	 * 
	 * @param {Array<{id: string}>} allAdAccounts - Array of ad account objects containing their IDs
	 * @param {string} accessToken - Facebook access token for authentication
	 * @param {Object} [params={}] - Optional parameters to pass to the Facebook API insights request
	 * @returns {Promise<Array<Object>>} Array of ads with their metrics data merged
	 */
	async fetchAllAdsWithMetrics (allAdAccounts, accessToken, params = {}) {
		const allAds = (await paralellize(allAdAccounts, ({id}) => this.facebookRemote.fetchGraphApi(`/${id}/ads`, accessToken, {fields: ['ad_id', 'account_id']}))).flat()
		
		const chunkedMetrics = chunkArray(Object.keys(zodSchemas.metrics))	// fml, 500 from fb in case of all metrics

		const allAdsWithMetrics = await paralellize(allAds, async (ad) => {
			const metricsData = await paralellize(chunkedMetrics, async (metrics) => {
				const data = await this.facebookRemote.fetchGraphApi(`/${ad.id}/insights`, accessToken, {
					...params,
					fields: metrics,
				})
				return data[0]
			})
			return metricsData.reduce((acc, data) => {return {...acc, ...data}}, {})
		})
		return allAdsWithMetrics.flat()
	}

	buildTableName (period, breakdowns) {
		const breakdownName = breakdowns.join('_')
		return `facebook_ads_insights_${period}_${breakdownName}`
	}

	buildFullyQualifiedTableName (tableName) {
		return `${config.google.projectId}.${config.google.bigQuery.datasetId}.${tableName}`
	}

	async ensureTables (periods = PERIODS, breakdowns = BREAKDOWNS) {
		const combinations = periods.flatMap((period) => breakdowns.map((breakdown) => ({period, breakdown})))
		await paralellize(combinations, async ({period, breakdown}) => {
			const tableName = this.buildTableName(period, breakdown)
			const fullyQualifiedTableName = this.buildFullyQualifiedTableName(tableName)
			const schema = zodSchemas.schemas[tableName]
			await getTable(fullyQualifiedTableName, schema)
		})	
	}

	async saveOneValue (period, breakdowns, data) {
		const tableName = this.buildTableName(period, breakdowns)
		const fullyQualifiedTableName = this.buildFullyQualifiedTableName(tableName)
		const schema = zodSchemas.schemas[tableName]
		const table = await getTable(fullyQualifiedTableName, schema)
		await table.insert(data)
	}

	/**
	 * Fetches all ads and their associated metrics for given ad accounts in all the used breakdowns and periods
	 * 
	 * @param {Array<{id: string}>} allAdAccounts - Array of ad account objects containing their IDs
	 * @param {string} accessToken - Facebook access token for authentication
	 * @param {Object} [params={}] - Optional parameters to pass to the Facebook API insights request - in future for passing metrics etc.
	 * @returns {Promise<Array<Object>>} Array of ads with their metrics data merged
	 */
	async fetchAllAdsWithMetricsPeriodsBreakdowns (allAdAccounts, accessToken, params = {}) {
		const allAdAccountsAds = (await paralellize(allAdAccounts, ({id}) => this.facebookRemote.fetchGraphApi(`/${id}/ads`, accessToken, {fields: ['ad_id', 'account_id']}))).flat()
		const adIds = allAdAccountsAds.map(({id}) => id)
		const adAdaccountMap = allAdAccountsAds.reduce((acc, {id, account_id}) => ({...acc, [id]: account_id}), {})	// @todo strycp smells

		const chunkedMetrics = chunkArray(Object.keys(zodSchemas.metrics))	// fml, 500 from fb in case of all metrics

		const dimensions = {
			metric: chunkedMetrics,
			period: PERIODS,
			breakdowns: BREAKDOWNS,
			adId: adIds,
		}
		const combinations = Object.entries(dimensions).reduce((acc, [key, values]) => {
			if (acc.length === 0) return values.map((value) => ({[key]: value}))
			return acc.flatMap((accItem) => values.map((value) => ({...accItem, [key]: value})))
		}, [])

		await this.ensureTables()

		return paralellize(combinations, async (combination) => {
			const {adId, period, breakdowns, metric} = combination
			const adAccountId = adAdaccountMap[adId]
			const insights = await this.fetchAdInsights(accessToken, adId, period, breakdowns, metric)
			const toSave = {
				ad_account_id: adAccountId,
				ad_id: adId,
				period,
				breakdowns,
				uid: randomUUID(),
				created_at: new Date(),
				insights,
			}
			return this.saveOneValue(period, breakdowns, toSave)
		})
	}
}