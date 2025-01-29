export const APP_ID = process.env.APP_ID
export const APP_SECRET = process.env.APP_SECRET
export const REDIRECT_URL = process.env.REDIRECT_URL
export const PERMISSIONS = ['ads_read', 'ads_management']

export const projectId = process.env.GOOGLE_CLOUD_PROJECT
export const datasetId = 'facebook_ads_insights'

export default {
    projectId,
    datasetId,
    APP_ID,
    APP_SECRET,
    REDIRECT_URL,
    PERMISSIONS
}