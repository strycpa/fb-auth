const {paralellize, chunkArray} = require('../../lib/utils')
const zodSchemas = require('../../lib/zod-shemas')

module.exports = class FacebookAdsInsightsSaverService {

	constructor(facebookRemote, tokenService) {
		this.facebookRemote = facebookRemote
		this.tokenService = tokenService
	}



	async _fetchAdAccountsBySource(accessToken, source) {
		switch (source) {
			case 'personal':
				return this.facebookRemote.fetchGraphApi('/me/adaccounts', accessToken)
			case 'business':
				const businesses = await this.facebookRemote.fetchGraphApi('/me/businesses', accessToken)
				return (await paralellize(businesses, ({id}) => this.facebookRemote.fetchGraphApi(`/${id}/owned_ad_accounts`, accessToken))).flat()
			default:
				throw new Error(`Unknown ad accounts source ${source}`)
		}
	}

	async fetchAllAdaccounts (accessToken) {
		const personalAdAccounts = await this._fetchAdAccountsBySource(accessToken, 'personal')
		const businessAdAccounts = await this._fetchAdAccountsBySource(accessToken, 'business')
		return [...personalAdAccounts, ...businessAdAccounts]
	}

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
		
	}
}