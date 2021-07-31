import Riak from "basho-riak-client/lib/client";
var crypto = require("crypto");

var RiakClient = require("basho-riak-client").Client;

// Specify ports of riak database nodes
var riakNodes = ['localhost:8087'];

export default async function createClientConnection() {
    return new Promise((resolve, reject) => {
        var riakClient = new RiakClient(riakNodes, (error, client) => {
            console.log('has error? -> ', error)
            if (error) {
                console.log('error indeed');
                error.hasError = true;
                reject(error);
                // throw new Error(error);
            } else {
                console.log("[+] Connection has been established with Riak nodes at: ", riakNodes);
    
                riakClient.ping((error) => {
                    if (error) {
                        reject("[riakClient.ping()] Error in connecting to database");
                        // throw new Error(error);
                    } else {
                    console.log("[+] Ping is successful");
                    resolve(riakClient);
                    }
                });
            }
        })
    });
}

export const endClientConnection = (riakClient) => {
    riakClient.stop((error) => {
        if (error) {
            console.error(error);
        } else {
            console.log("[!] Connection has been closed");
        }
    });
}

/** 
 * Checks if URL is valid. Accept html, htmls, and magnet:?xt=urn:
 *  @param {String} string - URL in string format
 */ 
function isValidURL(string) {
    // Check if matches basic url
    var res = string.match(/(^((http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)))+$/g);
    // Check if matches magnet link (magnet:?xt=urn:<anystring>)
    var res2 = string.match(/(^magnet:\?xt=urn:[^\s]{1,})+$/g);
    return (res !== null || res2 !== null);
};

/**
 * Creates a link from given JSON
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: redirectLink, String (optional): username}
 */
export const createLink = async (riakClient, myData) => {
    console.log('[createLink] Create link request');

    return new Promise((resolve, reject) => {
        if (!isValidURL(myData.redirectLink))
            reject("URL to be shorten is invalid");

        // Generate random a-zA-Z0-9
        // randomized key is unlikely to collide, checkLink() is not run
        var urlKey = crypto.randomBytes(28).toString('base64').replace(/\+/g, '').replace(/\//g, '').replace(/\=/g, '').slice(0, 8);
        // 28 Day difference in epoch
        var expiryDateUNIX = Date.now() + ( 28 * 24 * 60 * 60000);
        var ownerUsername = '-';

        // Override data if user is logged in
        if (myData.username){
            expiryDateUNIX = '-';
            ownerUsername = myData.username;
        }

        var data = {
            urlKey: urlKey,
            ownerUsername: ownerUsername,
            expiryDateUNIX: expiryDateUNIX,
            createdDateUNIX: Date.now(),
            redirectLink: myData.redirectLink,
        }

        var riakObj = new Riak.Commands.KV.RiakObject();
        riakObj.setContentType('text/plain');
        riakObj.setBucket('URL');
        riakObj.setKey(data.urlKey);
        riakObj.setValue(data);
        riakObj.addToIndex('ownerUsername_bin', data.ownerUsername);
        riakObj.addToIndex('expiryDateUNIX_bin', data.expiryDateUNIX);
        console.log('[createLink]');
        console.log(riakObj);

        var successReturnData = {
            status: 'success',
            urlKey: urlKey,
            expiryDateUNIX: data.expiryDateUNIX
        }

        riakClient.storeValue({ value: riakObj }, function (error, result) {
            if (error) {
                reject({status:'error', error: error});
                throw new Error(error);
            } else {
                resolve(successReturnData);
            }
        });
    });
}

/**
 * Checks if URLKey is available for use. Return promise resolve on 'ok' and 'not-ok'.
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: urlKey }
 * @returns {Promise} Promise - resolve({status: 'ok' OR status: 'not-ok', meessage: message})
 */
export const checkLink = async (riakClient, myData) => {
    console.log('[checkLink] Check link request');
    return new Promise((resolve, reject) => {
        riakClient.fetchValue({
            bucket: 'URL',
            key: myData.urlKey,
            convertToJs: true
        }, (error, result) => {
            if (error) {
                console.log('[checkLink] Database fetch error');
                reject({ status: "error", error: error });
            } else {
                if (result.isNotFound){
                    resolve({status: 'ok', message: 'URL Key is available'});
                } else {
                    resolve({status: 'not-ok', message: 'URL Key has been used for other link'});
                }
            }
        });
    });
}

/**
 * Checks if said user have ownership over the data
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: urlKey, String: ownerUsername }
 * @return {Promise} Promise - resolve({status:'success', message:message}), reject({status:'error', message:'No ownership'})
 */
export const checkOwnership = async (riakClient, myData) => {
    console.log('[checkOwnership] Checking data ownership');

    return new Promise((resolve, reject) => {
        riakClient.fetchValue({
            bucket: 'URL',
            key: myData.urlKey,
            convertToJs: true
        }, (error, result) => {

            if (error) {
                console.log('[checkOwnership] Database fetch error');
                reject({ status: "error", error: error });
            } else {
                // If data is not found, return reject promise
                if (result.isNotFound) {
                    console.log('[checkOwnership] Fetch not found');
                    reject({ status: "not-found", message: "No data with said URL Key" });
                } else {
                    var riakValue = result.values.shift().value;

                    if (riakValue.ownerUsername == myData.ownerUsername) {
                        resolve({status: 'success', message: 'User have ownership for the link '+riakValue.urlKey})
                    } else {
                        // Resolve? Reject?
                        console.log('[checkOwnership] Invalid ownership request');
                        reject({ status: "error", message: "Invalid ownership request" });
                    }
                }
            }
        });
    });
}

/**
 * Performs deletion of the Key object from defined bucket in default bucket type
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {String} bucketName - String of bucket containing the key-value
 * @param {String} keyName - String of key to be deleted
 */
export const genericDelete = async (riakClient, bucketName, keyName) => {
    console.log('[genericDelete] Delete key-value request');

    return new Promise((resolve, reject) => {
        riakClient.deleteValue({
            bucket: bucketName,
            key: keyName,
        }, (error, result) => {
            if (error) {
                console.log('[genericDelete] Key-value delete error');
                reject({ status: "error", error: error });
            } else {
                console.log('[genericDelete] Key-value delete success');
                resolve({ status: "success", result: result });
            }
        });
    });
}

/**
 * Performs ownership checking then deletes URL Key
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: urlKey, String: ownerUsername }
 */
export const deleteLink = async (riakClient, myData) => {
    console.log('[deleteLink] Delete link request');

    return new Promise((resolve, reject) => {
        (async function () {
            await checkOwnership(riakClient, myData).then(() => {
                genericDelete(riakClient, 'URL', myData.urlKey)
                    .then((result) => { 
                        console.log('[deleteLink] Database delete error');
                        resolve(result); })
                    .catch((error) => {
                        console.log('[deleteLink] Key-value delete success');
                        reject(error);});
            }).catch((error) => reject(error));
        })();
    });
}

/**
 * Update URL Key for the user's link
 * Performs checkLink(), fetch, deleteLink(), store
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: oldUrlKey, String: newUrlKey, String: ownerUsername }
 */
export const updateURLKey = async (riakClient, myData) => {
    console.log('[updateURLKey] Update URL Key request');

    return new Promise((resolve, reject) => {
        (async function(){
            // Check if new URLKey is available
            await checkLink(myData.newUrlKey)
                .then((res) => {
                    if(res.status == 'not-ok'){
                        reject({status: res.status, message: res.message});
                    } 
                    // Fetch old data, update key, delete with auth check, create new data
                    // Delete will takes precedence over create here
                    else if (res.status == 'ok'){

                        riakClient.fetchValue({
                            bucket: 'URL',
                            key: myData.oldUrlKey,
                            convertToJs: true
                        }, (error, result) => {
                            if (error) {
                                console.log('[updateURLKey] Database fetch error');
                                reject({ status: "error", error: error });
                            } else {
                                if (!result.isNotFound) {
                                    var riakObject = result.values.shift();
                                    var riakValue = riakObject.value;
                                    riakValue.urlKey = myData.newUrlKey;
                                    riakObject.setKey(myData.newUrlKey);
                                    riakObject.setValue(riakValue);

                                    deleteLink(riakClient, { urlKey: myData.oldUrlKey, ownerUsername: myData.ownerUsername })
                                        .then((result) => {
                                            riakClient.storeValue({ value: riakObject }, function (error, result2) {
                                                if (error) {
                                                    console.log('[updateURLKey] Record create error');
                                                    reject({status: 'error', error: error});
                                                } else {
                                                    console.log('[updateURLKey] Record update successful');
                                                    resolve({ status: "success", result: result2 });
                                                }
                                            });
                                        })
                                        .catch((error) => {
                                            reject({ status: "error", error: error });});
                                }
                            }
                        });                        
                    }})
                .catch((error) => reject({status: "error", error: error}));
        })();
    });
}

// pagination/continuation is not implemented. For pagination implementation refer:
// https://docs.riak.com/riak/kv/latest/developing/usage/secondary-indexes/index.html#pagination
/**
 * Retrieves a list of URL Keys associated to the ownerUsername using secondary index
 * @param {RiakClient} riakClient - RiakClient object
 * @param {JSON} myData - JSON object containing {String: ownerUsername}
 * @returns {Promise} query_keys - An array containing list of url keys registered by the user.
 */
export const batchRetrieveKeyList = async (riakClient, myData) => {
    console.log('[batchRetrieveKeyList] Batch retrieve URL Key request');

    var query_keys = [];
    return new Promise((resolve, reject) => {
        function queryCallback(err, rslt) { 
            /* rslt is in format of:
            {
                values: [ { indexKey: null, objectKey: 'UPKdlpyQ' } ],
                done: null,
                continuation: null
            }
            */
            if (err) {
                reject({ status: "error", error: error });
            }

            if (rslt.done) {
                query_keys.forEach(function (key) {
                    console.log("2i query key: '%s'", key);
                });

                console.log('[batchRetrieveKeyList] Batch retrieve completed');
                resolve(query_keys);
            }

            if (rslt.values.length > 0) {
                Array.prototype.push.apply(query_keys,
                    rslt.values.map(function (value) {
                            return value.objectKey;
                    }));
            }
        }

        var cmd = new Riak.Commands.KV.SecondaryIndexQuery.Builder()
            .withBucket('URL')
            .withIndexName('ownerUsername_bin')
            .withIndexKey(myData.ownerUsername)
            .withCallback(queryCallback)
            .build();
            riakClient.execute(cmd);
    });
} 

/**
 * Retrieves all the URL Link data from a given array of URL Keys
 * @param {RiakClient} riakClient  - RiakClient Object
 * @param {Array} query_keys - 1D array of strings containing all the url keys
 * @returns {Promise} allURLData - Array containing JSON objects of shortened URL data
 */
export const batchRetrieveURLKeyData = async (riakClient, query_keys) => {
    console.log('[batchRetrieveURLKeyData] Retrieve link list data request');

    return new Promise((resolve, reject) => {
        (async function(){
            const promises = query_keys.map(key => getLink(riakClient, key).then(result => {return result;}));
            const allURLData = await Promise.all(promises)
            resolve(allURLData);}
        )();
    });
}

// for sample only
// Createse sample of shortened link with deeefined redirectLink and ownerUsername
export const testCreateLink = async (riakClient) => {
    console.log('[testCreateLink] Create link request');
    
    return new Promise((resolve, reject) => {
        // 28 Day difference in epoch
        var expiryDateDiffInMinutes = 28*24*60*60000;
        // Generate random a-zA-Z0-9
        var urlKey = crypto.randomBytes(28).toString('base64').replace(/\+/g, '').replace(/\//g, '').replace(/\=/g, '').slice(0, 8);
        var data = {
            urlKey: urlKey,
            ownerUsername: '-',
            expiryDateUNIX: Date.now() + expiryDateDiffInMinutes,
            createdDateUNIX: Date.now(),
            redirectLink: 'https://docs.riak.com/riak/kv/latest/developing/getting-started/nodejs/querying/index.html',
        }
        var riakObj = new Riak.Commands.KV.RiakObject();
        riakObj.setContentType('text/plain');
        riakObj.setBucket('URL');
        riakObj.setKey(data.urlKey);
        riakObj.setValue(data);
        riakObj.addToIndex('ownerUsername_bin', data.ownerUsername);
        riakObj.addToIndex('expiryDateUNIX_bin', data.expiryDateUNIX);
        console.log('riak object <3');
        console.log(riakObj);
        riakClient.storeValue({ value: riakObj }, function (error, result) {
            if (error) {
                reject(error)
                throw new Error(error);
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Retrieves URL Key data
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {String} URLKey  - Key of URL
 * @returns {JSON} riakValue - JSON object containing {urlKey, ownerUsername, expiryDateUNIX,
            createdDateUNIX, redirectLink }
 */
export const getLink = async (riakClient, URLKey) => {
    return new Promise((resolve, reject) => {
        riakClient.fetchValue({
            bucket: 'URL',
            key: URLKey,
            convertToJs: true
        }, (error, result) => {
            if (error) {
                reject({status: 'error', error: error});
            } else {
                if (!result.isNotFound) {
                    var riakObject = result.values.shift();

                    var riakValue = riakObject.value;
                    console.log("[getLink] Retrieved object key: " + URLKey + " value: " + riakValue);
                    console.log(riakValue);
                    resolve(riakValue);
                } else
                    reject({status: 'not-ok'});
            }
        });
    });
}

// Updates URL Key by creating a new one.
// Does not delete old record, check availability, check ownerships.
// Do not use this, for proof of concept only.
export const testUpdateLink = async (riakClient, myData) => {
    return new Promise((resolve, reject) => {
        riakClient.fetchValue({
            bucket: 'URL',
            key: myData.oldURLKey,
            convertToJs: true
        }, (error, result) => {
            if (error) {
                reject(error);
            } else {
                if (!result.isNotFound) {
                    var riakObject = result.values.shift();

                    riakObject.setKey(myData.newURLKey);
                    riakClient.storeValue({ value: riakObject }, function (err, rslt) {
                        if (err) {
                            throw new Error(err);
                        }
                    });
                    resolve({status:"success"});
                }
                // resolve({isNotFound:true});
                reject("URL does not exist");
            }
        });
    });
}