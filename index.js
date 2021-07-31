var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var PORT = 1818;
import createClientConnection, { endClientConnection, testConnection, 
    testCreateLink, getLink, createLink, deleteLink, testUpdateLink, updateURLKey,
    batchRetrieveKeyList, batchRetrieveURLKeyData } from './riakConnection.js';


var riakClient;

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
        res.send('Error in connecting to database');
    } else {
        next();
    }
}

app.use(checkConnection);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send("Simple API Gateway");
});

// Fetches a sample key-value
app.get('/fetchSomething', (req, res) => {
    (async function(){
        var response = await testConnection(riakClient, 'key-value-store-demo2');
        console.log('response');
        console.log(response);
        res.send(response);
    })();
});

// Creates a sample link with the predefined link and username
// link: 'https://docs.riak.com/riak/kv/latest/developing/getting-started/nodejs/querying/index.html'
// ownerUsername:'-'
app.post('/testCreateLink', (req,res) => {
    (async function () {
        var response = await testCreateLink(riakClient);
        console.log('[Express] [TestCreateLink]');
        console.log(response);
        res.send(response);
    })();
});

// Creates a shortned link with the given JSON parameters
app.post('/createLink', (req, res) => {
    (async function(){
        var response = await createLink(riakClient, req.body).catch((error) => console.log(error));
        console.log('[Express] [CreateLink]');
        console.log(response);
        res.send(response);
    })();
});

// Retrieves JSON
app.post('/goto/:URLKey', (req, res) => {
    (async function () {
        var URLKey = req.params.URLKey;
        var response = await getLink(riakClient, URLKey).catch((error) => response = error );
        console.log('[Express] [Goto]');
        console.log(response);
        res.send(response);
    })();
});

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

// Deletes shortened URL with the given credential (ownerUsername)
// [!] Redundant parameter
app.delete('/delete/:URLKey', (req, res) => {
    (async function () {
        var response = await deleteLink(riakClient, req.body).catch( error => { console.log(error);});
        console.log('[Express] [Delete]');
        console.log(response);
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

// Update URL's key with the given credential
app.post('/update/:URLKey', (req, res) => {
    (async function () {
        var response = await updateURLKey(riakClient, req.body).catch(error => { console.log(error); });
        console.log('[Express] [UpdateTest]');
        console.log(response);
        res.send(response);
    })();
});

// Retrieves a list of URL Data associated with the given credential
app.post('/batchRetrieve', (req,res) => {
    (async function () {
        console.log('[Express] [testbatchretrieve]');
        var response0 = await batchRetrieveKeyList(riakClient, req.body).catch(error => { console.log(error); });
        var response = await batchRetrieveURLKeyData(riakClient, response0).then(result => res.send(result)).catch(error => console.log(error));

        // [!] If promise.all fails to loop, opt for timeout for batch retrieval
        // setTimeout(function () { res.send(allURLData); }, 3000);
    })();
});

app.listen(PORT, () => {
    console.log('[+] Server is listening on localhost:', PORT);
});
