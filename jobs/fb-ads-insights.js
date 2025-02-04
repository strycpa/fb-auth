import { Command } from 'commander'
import { Firestore } from '@google-cloud/firestore'
import { config } from '../config.js'
import FacebookAdsInsightsSaverService from '../src/service/facebook-ads-insights-saver-service.js'
import FacebookRemote from '../src/remote/facebook-remote.js'
import FacebookTokensService from '../src/service/facebook-tokens-service.js'
import { TokensRepository } from '../src/repository/facebook-tokens-repository.js'

const program = new Command()
const facebookRemote = new FacebookRemote()
const firestore = new Firestore({
	projectId: 'ravineo-tests',
})
const facebookTokensRepository = new TokensRepository(firestore)
const facebookTokensService = new FacebookTokensService(facebookRemote, facebookTokensRepository)
const facebookAdsInsightsSaverService = new FacebookAdsInsightsSaverService(facebookRemote, facebookTokensService)

const processJob = async (adAccountId) => {
	if (!adAccountId) throw new Error('Ad account id is required')

	const token = await facebookTokensRepository.fetchOneAdAccountTokenRandom(config.facebook.APP_ID, adAccountId)
	if (!token) throw new Error(`Token not found for app id ${config.facebook.APP_ID} and ad account id ${adAccountId}`)

	await facebookAdsInsightsSaverService.fetchAllAdsWithMetricsPeriodsBreakdowns([{ id: adAccountId }], token.access_token)
}

program
	.command('full-download')
	.description('Explode the ad account to all its ads and download all the metrics in every breakdown and period')
	.option('-a, --ad-account-id <adAccountId>', 'Ad account id')
	.action((options) => processJob(options.adAccountId))

program.parse()

// node jobs/fb-ads-insights.js full-download -a act_152311890