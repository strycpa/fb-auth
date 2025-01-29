import pMap from 'p-map'

const DEFAULT_CONCURRENCY = 10

export const paralellize = async (iterable, mapper) => {
	return pMap(iterable, mapper, {concurrency: DEFAULT_CONCURRENCY})
}

export const getTableName = (period, breakdowns) => `facebook_insights_${period}_${breakdownName}`

export const chunkArray = (array, chunkSize = 50) => {
	const chunks = []
	for (let i = 0; i < array.length; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize))
	}
	return chunks
}