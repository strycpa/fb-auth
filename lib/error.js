export class SocialNetworkError extends Error {
	constructor (error) {
		return super(error.error.message)
	} 
}