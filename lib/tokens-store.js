const collectionPath = (network, appId) => `tokens/${network}/apps/${appId}/users`

export class TokensStore {

	constructor (firestore, network) {
		this.firestore = firestore
		this.network = network
	}

	async fetchToken (userId, appId) {
		return this.firestore.collection(collectionPath(this.network, appId)).doc(userId).get()
	} 

	async saveToken (userId, appId, accessToken, permissions) {
		const existingToken = await this.firestore.collection(collectionPath(this.network, appId)).doc(userId).get()
		if (!existingToken.exists) {
			const insertedToken = await existingToken.ref.create({
				access_token: accessToken,
				user_id: userId,
				app_id: appId,
				permissions: permissions,
				created_at: new Date(),
			})
			console.log('insertedToken'); console.dir(insertedToken, {depth: null})
			return insertedToken
		} else {
			const updatedToken = await existingToken.ref.update({
				access_token: accessToken,
				app_id: appId,
				permissions: permissions,
				updated_at: new Date(),
			})
			console.log('updatedToken'); console.dir(updatedToken, {depth: null})
			return updatedToken
		}
	}

}