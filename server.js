require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { TokensStore } = require('./lib/tokens-store');
const { Firestore } = require('@google-cloud/firestore');
const { fetchGraphApi, createFetchGraphApi } = require('./src/remote/facebook-remote');
const app = express();
const PORT = process.env.PORT || 3000;

const firestore = new Firestore()

app.use(session({
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/config', (req, res) => {
	res.json({ appId: process.env.APP_ID });
});

app.get('/auth/callback', async (req, res) => {
	const { access_token } = req.query;
	console.log('access_token'); console.dir(access_token, {depth: null})

	if (!access_token) {
		return res.status(400).send('Access token is missing');
	}

	try {
		// Exchange short-lived token for long-lived token
		const longLivedTokenResponse = await fetchGraphApi('/oauth/access_token', access_token, {
			grant_type: 'fb_exchange_token',
			client_id: process.env.APP_ID,
			client_secret: process.env.APP_SECRET,
			fb_exchange_token: access_token,
		});
		console.log('longLivedTokenResponse'); console.dir(longLivedTokenResponse, {depth: null})
		const longLivedToken = longLivedTokenResponse.access_token;

		const f = createFetchGraphApi(longLivedToken)
		const [ me, permissions ] = await Promise.all([
			f('/me'),
			f('/me/permissions'),
		])

		// Store long-lived token to Firestore using TokensStore
		const tokensStore = new TokensStore(firestore, 'facebook');
		await tokensStore.saveToken(me.id, process.env.APP_ID, {
			access_token: longLivedToken, 
			permissions: permissions.data.map((o) => o.permission),
			comment: me.name
		});

		// Store user metadata in session
		req.session.user = me;

		res.send('Authentication callback route');
	} catch (error) {
		console.error('Error during authentication callback:', error);
		res.status(500).send('Internal Server Error');
	}
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
