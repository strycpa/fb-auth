const {SocialNetworkError} = require('../../lib/error')

const EMPTY_CURSOR = 'MAZDZD'	// facebook's magic cursor value which signals the next page is empty

const READ_SCORE = 1
const WRITE_SCORE = 3
const MAX_SCORE = 60
const DECAY = 300
const BLOCK = 300

class RequestQueue {
	constructor (maxScore, decaySeconds, blockSeconds) {
		this.maxScore = maxScore
		this.decaySeconds = decaySeconds
		this.blockSeconds = blockSeconds
		this.blocked = null
		this.requests = []
	}

	clean () {
		const now = Date.now()
		this.requests = this.requests.filter((req) => 
			(now - req.timestamp) < (this.decaySeconds * 1000)
		)
	}

	add (score = READ_SCORE) {
		this.clean()
		this.requests.push({
			score,
			timestamp: Date.now()
		})
	}

	block () {
		const now = Date.now()
		console.log('blocked', now)
		this.blocked = now
	}

	unblock () {
	console.log('unblocked')
		this.blocked = null
	}

	async canMakeRequest () {
		this.clean()
		if (this.requests.length === 0) return true

		const score = this.requests.reduce((acc, req) => acc + req.score, 0)
		if (score > this.maxScore) {
			this.block()
			await new Promise((resolve) => setTimeout(resolve, this.blockSeconds * 1000))
			this.unblock()
			return true
		}

		if (this.blocked) {
			await new Promise((resolve) => setTimeout(resolve, (this.blocked + this.blockSeconds * 1000) - Date.now()))
			this.unblock()
			return true
		}

		return true
	}
}

const requestQueue = new RequestQueue()

const fetchGraphApi = async (fragment, accessToken, params = {}) => {
	await requestQueue.canMakeRequest()
		
	const fetchUrl = new URL(`https://graph.facebook.com/v21.0${fragment}`)
	fetchUrl.search = new URLSearchParams({
		access_token: accessToken,
		...params
	}).toString()

	requestQueue.add(READ_SCORE)
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		console.error(`Fetch failed with status: ${response.status}`)
		const json = await response.json()
		if (json.error?.error?.error_subcode === 2446079) {	// User request limit reached
			requestQueue.block()
		}
		throw new SocialNetworkError(json)
	}
	const json = await response.json()
	const {data, paging} = json
	if (paging?.cursors?.after && paging.cursors.after !== EMPTY_CURSOR) {
		const secondResponse = await fetchGraphApi(fragment, accessToken, {
			...params,
			after: paging.cursors.after,
		})
		return [...data, ...secondResponse]
	}
	return data
}

const createFetchGraphApi = (accessToken) => (fragment, params) => fetchGraphApi(fragment, accessToken, params)

module.exports = {
	fetchGraphApi,
	createFetchGraphApi,
}