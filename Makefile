login:
	gcloud auth login
	gcloud auth application-default login

deploy:
	gcloud run deploy fb-auth \
		--source . \
		--project ravineo-tests \
		--region europe-west1 \
		--memory 2Gi \
		--cpu 1 \
		--ingress all \
		--allow-unauthenticated \
		--execution-environment gen2 \
		--min-instances 0 \
		--max-instances 1 \
		--set-env-vars REDIRECT_URL=https://fb.test.ravineo.com/auth/callback \
		--set-secrets APP_ID=fb_app_id:latest \
		--set-secrets APP_SECRET=fb_app_secret:latest \
		--command node,passport.js

deploy-job:
	gcloud run jobs deploy fb-ads-insights \
		--source . \
		--project ravineo-tests \
		--region europe-west1 \
		--parallelism 0 \
		--max-retries 0 \
		--task-timeout 6h \
		--set-env-vars GOOGLE_CLOUD_PROJECT=ravineo-tests \
		--set-secrets APP_ID=fb_app_id:latest \
		--set-secrets APP_SECRET=fb_app_secret:latest \
		--command node,jobs/fb-ads-insights.js 
