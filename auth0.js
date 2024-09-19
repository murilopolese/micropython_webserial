const APP_URL = "https://lab-micropython.arduino.cc"
const AUTH0_DOMAIN = "login.arduino.cc"
const AUTH0_CLIENT_ID = "Nsf3AfKOTw6Au9AGi8ALecA3aN3pVBcH"

var auth0Client;

const configureClient = async () => {
  auth0Client = await auth0.createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID
  });
};

const login = async () => {
  await auth0Client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin
    }
  });
};

const logout = async () => {
  auth0Client.logout({
    returnTo: APP_URL
  });
};

window.onload = async () => {
  await configureClient();
  const isAuthenticated = await auth0Client.isAuthenticated();

  if(!isAuthenticated){

    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
        // Process the login state
        try{
            await auth0Client.handleRedirectCallback();
        } catch (err){
            window.location = APP_URL
        }
            
    } else {
        //Require Login
        login();
    }
    
  }
}