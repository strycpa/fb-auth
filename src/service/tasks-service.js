import zodSchemas from '../../lib/zod-schemas.js'
import { BREAKDOWNS } from '../../lib/const/breakdowns.js'
import { PERIODS } from '../../lib/const/periods.js'
import { chunkArray } from '../../lib/utils.js'

export default class TasksService {
	/**
	 * Creates an instance of TasksService.
	 * @param {import('@google-cloud/tasks').CloudTasksClient} cloudTasksClient - The Cloud Tasks client
	 * @param {import('../repository/facebook-tokens-repository.js').TokensRepository} tokensRepository - The tokens repository
	 * @param {import('../remote/facebook-remote.js').default} facebookRemote - The Facebook remote
	 * @param {import('../../config.js')} config - The application configuration
	 */
	constructor(cloudTasksClient, tokensRepository, facebookRemote, config) {
		this.cloudTasksClient = cloudTasksClient
		this.tokensRepository = tokensRepository
		this.facebookRemote = facebookRemote
		this.config = config
	}

	async createTask(
		accountIds, 
		delaySeconds = 0, 
		breakdowns = BREAKDOWNS, 
		periods = PERIODS, 
		metrics = Object.keys(zodSchemas.metrics)
	) {
		const { google: { projectId, cloudTasks: { location, name } }, BASE_URL } = this.config

		const parent = this.cloudTasksClient.queuePath(projectId, location, name)
		const task = {
			httpRequest: {
				httpMethod: 'POST',
				url: `${BASE_URL}/api/task/process`,
				headers: {
					'Content-Type': 'application/json',
				},
				body: Buffer.from(JSON.stringify({
					accountIds,
					breakdowns,
					periods,
					metrics,
				})).toString('base64'),
			},
			scheduleTime: {
				seconds: Date.now() / 1000 + delaySeconds,
			},
		}

		const [response] = await this.cloudTasksClient.createTask({ parent, task })
		return response
	}

	async processTask(accountIds, breakdowns, periods, metrics) {
		const delaySeconds = 0	// @todo strycp this should be set up by some heuristic

		if (!Array.isArray(accountIds) || accountIds.length === 0) {
			throw new Error('Invalid or empty accountIds')
		}

		// unfold the task if there are multiple accounts
		if (Array.isArray(accountIds) && accountIds.length > 1) {
			await Promise.all(accountIds.map(async (accountId) => {
				await this.createTask([accountId], delaySeconds, breakdowns, periods, metrics)	// @todo strycp simplest recursive solution for now, but the roundtrip will be prohibitive in production
			}))
			return
		}

		// unfold the task if there are multiple breakdowns
		if (Array.isArray(breakdowns) && breakdowns.length > 1) {
			await Promise.all(breakdowns.map(async (breakdown) => {
				await this.createTask(accountIds, delaySeconds, [breakdown], periods, metrics)	// @todo strycp simplest recursive solution for now, but the roundtrip will be prohibitive in production
			}))
			return
		}

		// unfold the task if there are multiple periods
		if (Array.isArray(periods) && periods.length > 1) {
			await Promise.all(periods.map(async (period) => {
				await this.createTask(accountIds, delaySeconds, breakdowns, [period], metrics)	// @todo strycp simplest recursive solution for now, but the roundtrip will be prohibitive in production
			}))
			return
		}

		// unfold the task if there are more metrics than the fb api is able to handle in one call
		if (Array.isArray(metrics) && metrics.length > this.config.facebook.maxMetrics) {
			const chunkedMetrics = chunkArray(metrics, this.config.facebook.maxMetrics)	// fml, 500 from fb in case of all metrics
			await Promise.all(chunkedMetrics.map(async (metricsChunk) => {
				await this.createTask(accountIds, delaySeconds, breakdowns, periods, metricsChunk)	// @todo strycp simplest recursive solution for now, but the roundtrip will be prohibitive in production
			}))
			return
		}

		const accountId = accountIds[0]

		// unfold the task to multiple tasks for each ad of the ad account
		const ads = await this.facebookRemote.fetchGraphApi(`/${accountId}/ads`, { fields: ['ad_id', 'account_id'] })
		if (Array.isArray(ads) && ads.length > 1) {
			// await Promise.all(ads.map(async (period) => {
			// 	await this.createTask(accountIds, delaySeconds, breakdowns, [period], metrics)	// @todo strycp simplest recursive solution for now, but the roundtrip will be prohibitive in production
			// }))
			// return
		}

		const period = periods[0]

		const token = await this.tokensRepository.fetchOneAdAccountTokenRandom(this.config.facebook.APP_ID, accountId)

		const payload = {
			fields: metrics, 
			breakdowns,
		}
		if (period === PERIODS.daily) {
			payload.time_increment = 1
		}

		const data = await this.facebookRemote.fetchGraphApi(`/${adId}/insights`, token.access_token, payload)

		// @todo strycp TU POKRACOVAT V PONDELI. vykuchnout ukladani do bigquery
	}
}
