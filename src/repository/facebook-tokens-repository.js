const collectionPath = (network, appId) => `tokens/${network}/apps/${appId}/users`

export class TokensRepository {

	constructor (firestore, network) {
		this.firestore = firestore
		this.network = network
	}

	async fetchToken (userId, appId) {
		const token = await this.firestore.collection(collectionPath(this.network, appId)).doc(userId).get()
		if (!token.exists) {
			throw new Error(`Token not found for user id ${userId} and app id ${appId}`)
		}
		return token.data()
	} 

	async saveToken (userId, appId, data) {
		const existingToken = await this.firestore.collection(collectionPath(this.network, appId)).doc(userId).get()
		if (!existingToken.exists) {
			const insertedToken = await existingToken.ref.create({
				...data,
				user_id: userId,
				app_id: appId,
				created_at: new Date(),
			})
			console.log('insertedToken'); console.dir(insertedToken, {depth: null})
			return insertedToken
		} else {
			const updatedToken = await existingToken.ref.update({
				...data,
				updated_at: new Date(),
			})
			console.log('updatedToken'); console.dir(updatedToken, {depth: null})
			return updatedToken
		}
	}

	/**
	 * Fetches tokens that have access to specific ad accounts
	 * @param {string} appId - The Facebook app ID
	 * @param {string[]} adAccountIds - Array of ad account IDs to check
	 * @returns {Promise<Array>} - Array of tokens with access to any of the specified accounts
	 */
	async fetchAdAccountTokens(appId, adAccountIds) {
		const tokensRef = this.firestore.collection(collectionPath(this.network, appId))
		const snapshot = await tokensRef
			.where('ad_accounts', 'array-contains-any', adAccountIds)
			// add where for user_id for security
			.get()

		return snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}))
	}

	/**
	 * Fetches one random token that has access to specific ad account
	 * @param {string} appId - The Facebook app ID
	 * @param {string} adAccountId - The ad account ID
	 * @returns {Promise<Array>} - One randomly picked token with access to the specified ad account
	 */
	async fetchOneAdAccountTokenRandom(appId, adAccountId) {
		const tokensRef = this.firestore.collection(collectionPath(this.network, appId))
		const snapshot = await tokensRef
			.where('ad_accounts', 'array-contains', adAccountId)
			// @todo strycp add where for user_id for security
			.orderBy('random')
			.limit(1)
			.get()
		if (!snapshot.docs.length) {
			throw new Error(`No token found for ad account ${adAccountId}`)
		}
		return snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}))
	}

}