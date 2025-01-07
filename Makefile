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