var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var cors = require('cors')

var PORT = 1818;
import createClientConnection, { endClientConnection } from './riakConnection/riakConnection.js';

import {
    testCreateLink, getLink, createLink, deleteLink, testUpdateLink, updateURLKey,
    checkLink, batchRetrieveKeyList, batchRetrieveURLKeyData
} from './riakConnection/bucketOperation/url.js';

import {
    createUser, changePassword, findUser, loginAccount, deleteAccount
} from './riakConnection/bucketOperation/user.js';

var riakClient;

app.use(cors({ origin: '*' }));
app.use(checkConnection);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send("Simple API Gateway");
});

function successfulConnection(resolvedValue) {
    riakClient = resolvedValue;
    console.log('[successfulConnection] Database connection secured');
}

function unsuccessfulConnection(rejectedValue) {
    riakClient = rejectedValue;
    console.log('[unsuccessfulConnection()] No database connection');
}

createClientConnection().then(successfulConnection, unsuccessfulConnection);

// Check connection everytime a request is received
function checkConnection(req, res, next) {
    console.log('[checkConnection()] Logged');
    if (riakClient.hasError){
        console.log('Error in connecting to database');
        res.send({status:'error', error:'Error in connecting to database'});
    } else {
        next();
    }
}

/******************************************************************************************************************/
/*
/*
/*  URL management Operations. Sorted by: Create, Retrieve, Update, Delete, helper / redundant request
/*
/*
/******************************************************************************************************************/


/********* Create operations *********/


// Creates a shortned link with the given JSON parameters
// {JSON} JSON Object containing { String: redirectLink, String (optional): username}
app.post('/createLink', (req, res) => {
    (async function () {
        var response = await createLink(riakClient, req.body).catch((error) => console.log(error));
        console.log('[Express] [CreateLink]');
        console.log(response);
        res.send(response);
    })();
});

// Creates a sample link with the predefined link and username, no req.body required
// link: 'https://docs.riak.com/riak/kv/latest/developing/getting-started/nodejs/querying/index.html'
// ownerUsername:'-'
app.post('/testCreateLink', (req, res) => {
    (async function () {
        var response = await testCreateLink(riakClient);
        console.log('[Express] [TestCreateLink]');
        console.log(response);
        res.send(response);
    })();
});


/********* Retrieve operations *********/


// Retrieves JSON
// {JSON} JSON Object containing { String: URLKey }
app.post('/goto/:URLKey', (req, res) => {
    (async function () {
        var URLKey = req.params.URLKey;
        var response = await getLink(riakClient, URLKey).catch((error) => response = error);
        console.log('[Express] [Goto]');
        console.log(response);
        res.send(response);
    })();
});

// Retrieves a list of URL Data associated with the given credential
// {JSON} JSON Object containing { String: ownerUsername }
app.post('/batchRetrieve', (req, res) => {
    (async function () {
        console.log('[Express] [testBatchRetrieve]');
        var response0 = await batchRetrieveKeyList(riakClient, req.body).catch(error => { console.log(error); });
        var response = await batchRetrieveURLKeyData(riakClient, response0).then(result => res.send(result)).catch(error => console.log(error));

        // [!] If promise.all fails to loop, opt for timeout for batch retrieval
        // setTimeout(function () { res.send(allURLData); }, 3000);
    })();
});


/********* Update operations *********/


// Update URL's key with the given credential
// Example of updating key operation
// {JSON} JSON Object containing { String: oldUrlKey, String: newUrlKey, String: ownerUsername }
app.post('/update/:URLKey', (req, res) => {
    (async function () {
        var response = await updateURLKey(riakClient, req.body).catch(error => { console.log(error); });
        console.log('[Express] [Update]');
        console.log(response);
        res.send(response);
    })();
});


/********* Delete operations *********/


// Deletes shortened URL with the given credential (ownerUsername)
// Takes ownerUsername, urlKey
// Delete request body sent from client should be encapsuled in 'body' key
// Eg {'body': {ownerUsername: ownerUsername, urlKey: urlKey}}
// [!] Redundant parameter
app.delete('/delete/:URLKey', (req, res) => {
    (async function () {
        var response = await deleteLink(riakClient, req.body).catch(error => { console.log(error); });
        console.log('[Express] [Delete]');
        console.log(response);
        res.send(response);
    })();
});


/********* Helper / redundant operations *********/


// Retrieves JSON for get site
// [!] Pending remove
app.get('/goto/:URLKey', (req, res) => {
    (async function () {
        var URLKey = req.params.URLKey;
        var response = await getLink(riakClient, URLKey).catch((error) => response = error);
        console.log('[Express] [Goto]');
        console.log(response);
        res.send(response);
    })();
});

// Fetches a sample key-value
app.get('/fetchSomething', (req, res) => {
    (async function(){
        var URLKey = "oWwmv3Sa";
        var response = await getLink(riakClient, URLKey).catch((error) => response = error);
        res.send(response);
    })();
});


// Checks if URL Key is available
// Returns status: 'ok' and 'not-ok'
// {JSON} JSON Object containing { String: urlKey }
app.post('/check/:URLKey', (req, res) => {
    (async function(){
        var URLKey = req.params.URLKey;
        var response = await checkLink(riakClient, URLKey).catch(error => { console.log(error); });
        console.log('[Express] [Check URL]');
        res.send(response);
    })();
});

// Test update
// Update URL's key with the given url link. No credential checking
// [!] Pending remove
app.post('/testupdate/:URLKey', (req, res) => {
    (async function() {
        var response = await testUpdateLink(riakClient, req.body).catch(error => { console.log(error); });
        console.log('[Express] [UpdateTest]');
        console.log(response);
        res.send(response);
    })();
});



/******************************************************************************************************************/
/*
/*
/*  User management Operations. Sorted by: Create, Retrieve, Update, Delete
/*
/*
/******************************************************************************************************************/


/********* Create operations *********/



// Create a new user with the password
// {JSON} JSON Object containing { String: username, String: email, String: password}
// All object format will be checked.
app.post('/createUser', (req, res) => {
    (async function () {
        console.log('[Express] [createUser]');
        var response = await createUser(riakClient, req.body).catch(error => { console.log(error); });
        res.send(response);
    })();
});



/********* Retrieve operations *********/


// Find the user using given username
// {JSON} JSON Object containing { String: username }
app.post('/findUser', (req, res) => {
    (async function () {
        console.log('[Express] [findUser]');
        var response = await findUser(riakClient, req.body).catch(error => { console.log(error); });
        res.send(response);
    })();
});

// Login into account using given username and password
// {JSON} JSON Object containing { String: username, String: password}
app.post('/loginAccount', (req, res) => {
    (async function () {
        console.log('[Express] [loginAccount]');
        var response = await loginAccount(riakClient, req.body).catch(error => { console.log(error); });
        res.send(response);
    })();
});



/********* Update operations *********/


// Create a new user with the password
// {JSON} JSON Object containing { String: username, String: email, String: password}
// Password format will be checked.
app.put('/changePassword', (req, res) => {
    (async function () {
        console.log('[Express] [changePassword]');
        var response = await changePassword(riakClient, req.body).catch(error => { console.log(error); });
        res.send(response);
    })();
});


/********* Delete operations *********/


// Delete an account using the useerename
// {JSON} JSON Object containing { String: username }
// [!] Not used in the front end
app.delete('/deleteAccount', (req, res) => {
    (async function () {
        console.log('[Express] [deleteAccount]');
        var response = await deleteAccount(riakClient, req.body).catch(error => { console.log(error); });
        res.send(response);
    })();
});

app.listen(PORT, () => {
    var site = 'http://localhost:'+PORT+'/';
    var site2 = 'http://127.0.0.1:'+PORT+'/';
    console.log('[+] Server is listening on '+site + ' or '+site2);
});
