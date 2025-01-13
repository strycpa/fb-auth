require('dotenv').config()
const express = require('express')
const session = require('express-session')
const passport = require('passport')
const FacebookStrategy = require('passport-facebook')
const {Firestore} = require('@google-cloud/firestore')
const app = express()
const port = process.env.PORT || 8000

const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
if (!APP_ID || !APP_SECRET) throw new Error('Missing necessary app info in .env')
const REDIRECT_URL = process.env.REDIRECT_URL || 'http://localhost:8000/auth/callback'
const PERMISSIONS = process.env.PERMISSIONS || 'public_profile,read_insights,business_management,ads_read,pages_read_engagement'
const USER_ID = '10235767919166237'

const firestore = new Firestore()
const tokensFacebookCollection = firestore.collection('tokens_facebook')


const fetchGraphApi = async (fragment, accessToken, params = {}) => {
	const fetchUrl = new URL(`https://graph.facebook.com/v21.0${fragment}`)
	fetchUrl.search = new URLSearchParams({
		access_token: accessToken,
		...params
	}).toString()
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		console.error(`Fetch failed with status: ${response.status}`)
	}
	return response.json()
}
const createFetchGraphApi = (accessToken) => (fragment, params) => fetchGraphApi(fragment, accessToken, params)

;(async () => {
	const snapshot = await tokensFacebookCollection.where('user_id', '==', USER_ID).limit(1).get()
	const {access_token: accessToken} = snapshot.docs[0].data()
	const f = createFetchGraphApi(accessToken)

	const adAccounts = await f('/me/adaccounts', {fields: ['id', 'name']})
	console.log('adAccounts'); console.dir(adAccounts, {depth: null})
	const adAccountAds = await Promise.all(adAccounts.data.map(async (adAccount) => {
		const adAccountId = adAccount.id
		const ads = await f(`/${adAccount.id}/ads`, {fields:['id', 'name', 'ad_account_id']})
		return {adAccountId, ads}
	}))
	console.log('adAccountAds'); console.dir(adAccountAds, {depth: null})
	const creatives = await Promise.all(adAccountAds.map(async ({adAccountId, ads}) => Promise.all(ads.data.map(async (ad) => {
		const adId = ad.id
		const creative = await f(`/${adId}/`, {fields: ['id', 'name', 'creative']})
		const creativeId = creative.creative.id
		const creativeDetail = await f(`/${creativeId}/`, {fields: ['id', 'name', 'object_type', 'object_url', 'image_url', 'link_url', 'video_id']})
		if (creativeDetail.object_type === 'VIDEO') {
			const videoInsights = await f(`/${creativeDetail.video_id}/`, {fields: ['video_insights', 'post_id', 'collaborators', 'permalink_url']})
			return {adAccountId, adId, creativeId, creativeDetail, videoInsights}
		}
		return {adAccountId, adId, creativeId, creativeDetail}
	}))))
	console.log('creatives'); console.dir(creatives, {depth: null})
})()