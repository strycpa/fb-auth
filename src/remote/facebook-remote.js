const SocialNetworkError = require('../../lib/error')

const EMPTY_CURSOR = 'MAZDZD'	// facebook's magic cursor value which signals the next page is empty

const fetchGraphApi = async (fragment, accessToken, params = {}) => {
	const fetchUrl = new URL(`https://graph.facebook.com/v21.0${fragment}`)
	fetchUrl.search = new URLSearchParams({
		access_token: accessToken,
		...params
	}).toString()
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		console.error(`Fetch failed with status: ${response.status}`)
		throw new SocialNetworkError(await response.json())
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