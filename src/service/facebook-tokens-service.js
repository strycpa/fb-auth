import FacebookRemote from '../remote/facebook-remote.js'
import { TokensRepository } from '../repository/facebook-tokens-repository.js'

/**
 * Service for handling Facebook tokens.
 */
export default class FacebookTokensService {
	/**
	 * Creates an instance of FacebookTokensService.
	 * @param {FacebookRemote} facebookRemote - The Facebook remote service.
	 * @param {TokensRepository} facebookTokensRepository - The Facebook tokens repository.
	 */
	constructor(facebookRemote, facebookTokensRepository) {
		this.facebookRemote = facebookRemote
		this.facebookTokensRepository = facebookTokensRepository
	}

	/**
	 * Exchanges a short-lived token for a long-lived token.
	 * @param {string} accessToken - The short-lived access token.
	 * @returns {Promise<string>} - The long-lived access token.
	 */
	async exchangeLongLivedToken(accessToken) {
		const longLivedTokenResponse = await this.facebookRemote.fetchGraphApi('/oauth/access_token', accessToken, {
			grant_type: 'fb_exchange_token',
			client_id: process.env.APP_ID,
			client_secret: process.env.APP_SECRET,
			fb_exchange_token: accessToken,
		})
		return longLivedTokenResponse.access_token
	}

	/**
	 * Stores the token in the repository.
	 * @param {string} appId - The Facebook app ID.
	 * @param {string} accessToken - The access token to store.
	 * @returns {Promise<object>} - The user metadata.
	 */
	async storeToken(appId, accessToken) {
		const f = this.facebookRemote.createFetchGraphApi(accessToken)
		const [ me, permissions, adAccounts ] = await Promise.all([
			f('/me'),
			f('/me/permissions'),
			f('/me/adaccounts', {
				fields: 'id,name,business{id,name}'  // Add fields we need
			})
		])

		// Extract unique business IDs directly from adAccounts array
		const businessIds = adAccounts
			.filter(account => account.business)
			.map(account => account.business.id)
		
		// Remove duplicates from business IDs
		const uniqueBusinessIds = [...new Set(businessIds)]

		await this.facebookTokensRepository.saveToken(me.id, appId, {
			access_token: accessToken, 
			permissions: permissions.data.map((o) => o.permission),
			comment: me.name,
			ad_accounts: adAccounts.map(account => account.id),
			businesses: uniqueBusinessIds
		})

		return me	// @todo strycp that doesn't seem to be right. leave it for now, refactor later
	}
}