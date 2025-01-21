const EMPTY_CURSOR = 'MAZDZD'	// facebook's magic cursor value which signals the next page is empty

export const fetchGraphApi = async (fragment, accessToken, params = {}) => {
	const fetchUrl = new URL(`https://graph.facebook.com/v21.0${fragment}`)
	fetchUrl.search = new URLSearchParams({
		access_token: accessToken,
		...params
	}).toString()
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		console.error(`Fetch failed with status: ${response.status}`)
		console.error(await response.json())
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

export const createFetchGraphApi = (accessToken) => (fragment, params) => fetchGraphApi(fragment, accessToken, params)