module.exports = class FacebookTokensService {
	/**
	 * Creates an instance of FacebookTokensService.
	 * @param {import("../remote/facebook-remote")} facebookRemote - The Facebook remote service.
	 * @param {import("../repository/facebook-tokens-repository")} facebookTokensRepository - The Facebook tokens repository.
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
		const [ me, permissions ] = await Promise.all([
			f('/me'),
			f('/me/permissions'),
		])

		await this.facebookTokensRepository.saveToken(me.id, appId, {
			access_token: accessToken, 
			permissions: permissions.data.map((o) => o.permission),
			comment: me.name
		})

		return me	// @todo strycp that doesn't seem to be right. leave it for now, refactor later
	}
}