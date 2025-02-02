const COLLECTION_PATH = 'tokens_facebook'

export class TokensRepository {
	constructor(firestore) {
		this.firestore = firestore
		this.collection = this.firestore.collection(COLLECTION_PATH)
	}

	async fetchToken(appId, userId) {
		const snapshot = await this.collection
			.where('app_id', '==', appId)
			.where('user_id', '==', userId)
			.limit(1)
			.get()

		if (snapshot.empty) {
			throw new Error(`Token not found for app id ${appId} and user id ${userId}`)
		}

		return snapshot.docs[0].data()
	}

	async saveToken(appId, userId, data) {
		const snapshot = await this.collection
			.where('app_id', '==', appId)
			.where('user_id', '==', userId)
			.limit(1)
			.get()

		if (snapshot.empty) {
			await this.collection.add({
				...data,
				app_id: appId,
				user_id: userId,
				created_at: new Date()
			})
		} else {
			await snapshot.docs[0].ref.update({
				...data,
				updated_at: new Date()
			})
		}
	}

	async fetchAdAccountTokens(appId, adAccountIds) {
		const snapshot = await this.collection
			.where('app_id', '==', appId)
			.where('ad_accounts', 'array-contains-any', adAccountIds)
			.get()

		return snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}))
	}

	async fetchOneAdAccountTokenRandom(appId, adAccountId) {
		const snapshot = await this.collection
			.where('app_id', '==', appId)
			.where('ad_accounts', 'array-contains', adAccountId)
			.orderBy('random')
			.limit(1)
			.get()

		if (snapshot.empty) {
			throw new Error(`No token found for ad account ${adAccountId}`)
		}

		return snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}))
	}
}