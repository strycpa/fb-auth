export default class TasksService {
	constructor(cloudTasksClient, tokensRepository, facebookAdsInsightsSaverService, config) {
		this.cloudTasksClient = cloudTasksClient
		this.tokensRepository = tokensRepository
		this.facebookAdsInsightsSaverService = facebookAdsInsightsSaverService
		this.config = config
	}

	async createTask(data, delaySeconds = 0) {
		const { google: { projectId, cloudTasks: { location, name } }, BASE_URL } = this.config
		
		const parent = this.cloudTasksClient.queuePath(projectId, location, name)
		const task = {
			httpRequest: {
				httpMethod: 'POST',
				url: `${BASE_URL}/api/task/process`,
				headers: {
					'Content-Type': 'application/json',
				},
				body: Buffer.from(JSON.stringify(data)).toString('base64'),
			},
			scheduleTime: {
				seconds: Date.now() / 1000 + delaySeconds,
			},
		}

		const [response] = await this.cloudTasksClient.createTask({ parent, task })
		return response
	}

	async processTask(accountIds) {
		if (!Array.isArray(accountIds) || accountIds.length === 0) {
			throw new Error('Invalid or empty accountIds')
		}

		const selectedAdAccounts = accountIds.map(id => ({ id }))
		const tokens = await this.tokensRepository.fetchAdAccountTokens(this.config.facebook.APP_ID, accountIds)
		
		if (tokens.length === 0) {
			throw new Error('No tokens found with access to the specified accounts')
		}

		// Use only the first token that has access to these accounts
		await this.facebookAdsInsightsSaverService.saveAdsInsights(
			selectedAdAccounts,
			tokens[0].access_token
		)
	}
}
