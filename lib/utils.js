import pMap from "p-map"

const DEFAULT_CONCURRENCY = 10

export const paralellize = async (iterable, mapper) => {
	return pMap(iterable, mapper, {concurrency: DEFAULT_CONCURRENCY})
}