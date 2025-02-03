import { paralellize, chunkArray } from '../../lib/utils.js'
import zodSchemas from '../../lib/zod-schemas.js'

export default class FacebookAdsInsightsSaverService {

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

	/**
	 * @todo strycp for now it's choked on only one ad and no breakdowns to avoid tripping the limits
	 * Fetches all ads and their associated metrics for given ad accounts in all the used breakdowns and periods
	 * 
	 * @param {Array<{id: string}>} allAdAccounts - Array of ad account objects containing their IDs
	 * @param {string} accessToken - Facebook access token for authentication
	 * @param {Object} [params={}] - Optional parameters to pass to the Facebook API insights request
	 * @returns {Promise<Array<Object>>} Array of ads with their metrics data merged
	 */
	async fetchAllAdsWithMetrics (allAdAccounts, accessToken, params = {}) {
		const allAds = (await paralellize(allAdAccounts, ({id}) => this.facebookRemote.fetchGraphApi(`/${id}/ads`, accessToken, {fields: ['ad_id', 'account_id']}))).flat()
		
		const chunkedMetrics = chunkArray(Object.keys(zodSchemas.metrics))	// @todo strycp fml, 500 from fb in case of all metrics

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

	async saveInsights(accessToken, adAccountId, insights) {
		// Implementation here
	}
}