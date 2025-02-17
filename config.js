import 'dotenv/config'

export const config = {
	facebook: {
		APP_ID: process.env.APP_ID,
		APP_SECRET: process.env.APP_SECRET,
		REDIRECT_URL: process.env.REDIRECT_URL,
		PERMISSIONS: ['ads_read', 'ads_management'],
		maxMetrics: 50,
	},
	google: {
		projectId: 'ravineo-tests',
		bigQuery: {
			location: 'EU',	
			datasetId: 'facebook_ads_insights',
		},
		cloudTasks: {
			name: 'facebook-ads-insights-full-download-eu-w1',
			location: 'europe-west1'
		}
	},
	BASE_URL: process.env.BASE_URL || 'http://localhost:3000'
}