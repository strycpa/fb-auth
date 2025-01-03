require('dotenv').config()
const express = require('express')
const app = express()
const port = 8000

const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
const TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token'
const REDIRECT_URL = 'http://localhost:8000/auth/callback'

app.get('/auth', (req, res) => {
	res.send(`<html><head><script>
  window.fbAsyncInit = function() {
    FB.init({
      appId      : '${APP_ID}',
      cookie     : true,
      xfbml      : true,
      version    : '{api-version}'
    });
      
    FB.AppEvents.logPageView();   
      
  };

  (function(d, s, id){
     var js, fjs = d.getElementsByTagName(s)[0];
     if (d.getElementById(id)) {return;}
     js = d.createElement(s); js.id = id;
     js.src = "https://connect.facebook.net/en_US/sdk.js";
     fjs.parentNode.insertBefore(js, fjs);
   }(document, 'script', 'facebook-jssdk'));
</script></head></html>`)
})

app.get('/auth/callback', async (req, res) => {
    console.log('req.query', req.query)
    const payload = {
      client_id: APP_ID,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URL,
      code: req.query.code
    }
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'GET',
      body: JSON.stringify(payload)
    })
		console.log('tokenResponse', tokenResponse)
    res.send()
})

app.get('/privacy', (req, res) => {
		res.send('TBD')
})

app.listen(port, () => console.log(`listening on port ${port}`))