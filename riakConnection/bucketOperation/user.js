import Riak from "basho-riak-client/lib/client";
import { genericDelete } from "./url.js";
const bcrypt = require('bcrypt');
const dotenv = require('dotenv')
dotenv.config({ path: './.env' });

function isValidUsernameFormat(username){
    var res = username.match(/^[A-Za-z0-9._]{4,20}$/);
    return (res !== null);
}

function isValidEmailFormat(email){
    var res = email.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$/);
    return (res !== null);
}

function isValidPasswordFormat(password){
    // Password should contain at least 1 uppercase letter, 1 number, and be between 8 to 16 characters
    // Alphanumuric only
    var res = password.match(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,17}$/);
    return (res !== null);
}

// Salt hash the password for additional protection
// Reference: https://heynode.com/blog/2020-04/salt-and-hash-passwords-bcrypt/
async function createSaltHashPassword(password){
    const saltRounds = 8;
    const hashedPassword = await new Promise((resolve, reject) => {
        bcrypt.genSalt(saltRounds, function (err, salt) {
            if (err) reject(err);

            bcrypt.hash(password, saltRounds, function (err, hash) {
                if (err) reject(err);
                resolve(hash);
            });
        });
    });

    return hashedPassword
}

// Check if the given string password is similar to the given salt hashed Password
async function matchPassword(password, saltHashedPassword) {
    const match = await new Promise((resolve, reject) => {
        bcrypt.compare(password, saltHashedPassword, function(err, result){
            if (err) {
                console.log('[matchPassword] Error ' + err); 
                reject(err);
            }
            resolve(result);
        });
    });

    return match;
}

/**
 *  Get user object, no password
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: username}
 * @return {JSON} - JSON Object containing {username, email, createdDateUNIX, status}
 */
export const findUser = async (riakClient, myData) => {
    console.log('[findUser] Find user request');

    return new Promise((resolve, reject) => {
  
        riakClient.fetchValue({
            bucket: 'USER',
            key: myData.username,
            convertToJs: true
        }, (error, result) => {
            if (error) {
                console.log('[findUser] Database fetch error in username');
                reject({ status: "error", error: error });
            } else {
                if (result.isNotFound) {
                    console.log('[findUser] No user with the username : ' + myData.username);
                    resolve({ status: 'not-ok', message: 'No user with the username' });
                } else {
                    var riakObject = result.values.shift();

                    var riakValue = riakObject.value;
                    riakValue.status = 'ok';
                    console.log("[findUser] Retrieved object key: " + myData.username + " value: " + riakValue);
                    console.log(riakValue);
                    resolve(riakValue);
                }
            }
        });
    });
}

/**
 *  Find the username with the email given
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: email}
 * @return {JSON} - JSON Object containing {status: 'ok'/'not-ok', username: Array(String)}
 */
export const findUsernameByEmail = async (riakClient, myData) => {

    var query_keys = [];
    return new Promise((resolve, reject) => {
        function queryCallback(err, rslt) {
            if (err) {
                reject({ status: "error", error: error });
            }

            // This will run last
            if (rslt.done) {
                query_keys.forEach(function (key) {
                    console.log("2i query key: '%s'", key);
                });

                if (query_keys.length > 0) {
                    console.log('[findUsernameByEmail] Username found');
                    resolve({status: 'ok', username: query_keys});
                } else {
                    console.log('[findUsernameByEmail] No user registered under this email');
                    resolve({ status: "not-ok", message: "No user registered under the email: " + myData.email });
                }
            }

            if (rslt.values.length > 0) {
                console.log('[findUsernameByEmail] There are user registered under this email');
                Array.prototype.push.apply(query_keys,
                    rslt.values.map(function (value) {
                        return value.objectKey;
                    }));
            } 
        }

        var cmd = new Riak.Commands.KV.SecondaryIndexQuery.Builder()
            .withBucket('USER')
            .withIndexName('email_bin')
            .withIndexKey(myData.email)
            .withCallback(queryCallback)
            .build();
        riakClient.execute(cmd);
    });
}

/**
 * Creates a link from given JSON
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: username, String: email, String: password}
 */
export const createUser = async (riakClient, myData) => {
    console.log('[createUser] Create user request');

    return new Promise((resolve, reject) => {
        if (!isValidEmailFormat(myData.email)){
            reject("Email format is invalid"); }

        if (!isValidUsernameFormat(myData.username)) {
            reject("Username format is invalid"); }

        if (!isValidPasswordFormat(myData.password)){
            reject("Password format is invalid");}

        // Insert only new unique data
        findUser(riakClient, {username: myData.username, email: myData.email})
        .then((result) => {
            if(result.status == 'ok'){
                console.log('[createUser] Username has already been used');
                resolve({status:'not-ok', message:'Username has already been registered'});
            }
            else {
                findUsernameByEmail(riakClient, {email:myData.email})
                .then((result2) => {
                    if(result2.status == 'ok'){
                        console.log('[createUser] Email has already been used');
                        resolve({ status: 'not-ok', message: 'Email has already been registered' });
                    }
                    else {
                        console.log('[createUser] Email and username are available');
                        console.log(result2);

                        (async function(){
                            var saltHashedPassword = await createSaltHashPassword(myData.password)
                                .then((saltHashedPasswordResult) => {
                                var data = {
                                    username: myData.username,
                                    email: myData.email,
                                    password: saltHashedPasswordResult,
                                    createdDateUNIX: Date.now(),
                                }
    
                                var riakObj = new Riak.Commands.KV.RiakObject();
                                riakObj.setContentType('text/plain');
                                riakObj.setBucket('USER');
                                riakObj.setKey(data.username);
                                riakObj.setValue(data);
                                riakObj.addToIndex('email_bin', data.email);
                                console.log('[createUser] To be inserted value:');
                                console.log(riakObj);
    
                                var successReturnData = {
                                    status: 'success',
                                    username: data.username,
                                    email: data.email
                                }
    
                                riakClient.storeValue({ value: riakObj }, function (error, result) {
                                    if (error) {
                                        reject({ status: 'error', error: error });
                                    } else {
                                        console.log('[createUser] Create user successful');
                                        resolve(successReturnData);
                                    }
                                });
                            })
                            .catch((error) => reject(error));
                        })();
    
                    }
                })
                .catch((error) => reject(error));
            }
        })
        .catch((error) => reject(error));
        
    });
}

/**
 *  Change user password with the given parameters
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: username, String: email, String: password}
 */
export const changePassword = async (riakClient, myData) => {
    console.log('[changePassword] Change password request');

    return new Promise((resolve, reject) => {
        if (!isValidPasswordFormat(myData.password)) {
            reject("Password format is invalid");
        }

        findUsernameByEmail(riakClient,{email:myData.email})
        .then((result)=>{
            // Username found
            if(result.status == 'ok') {
                console.log('[changePassword] Username found with the given email');
                console.log(result.username[0]);

                if(myData.username == result.username[0]){
                    riakClient.fetchValue({
                        bucket: 'USER',
                        key: myData.username,
                        convertToJs: true
                    }, (error, result) => {
                        if (error) {
                            console.log('[changePassword] Database fetch error');
                            reject({ status: "error", error: error });
                        } else {
                            if (!result.isNotFound) {
                                var saltHashedPassword = createSaltHashPassword(myData.password);

                                var riakObject = result.values.shift();
                                var riakValue = riakObject.value;
                                riakValue.password = saltHashedPassword;
                                riakObject.setValue(riakValue);

                                console.log('[changePassword] Password update successful');
                                resolve({status:'ok', message:'Password has beeen updated'});
                            }
                        }
                    });
                } else {
                    console.log('[changePassword] Given username does not match email of username');
                    resolve({ status: 'not-ok', message:'Given username does not match email of username'})
                }
                resolve(result);


            }
        })
        .catch((error) => {reject(error);});
       
    });
}

/**
 *  Login with the parameter
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: username, String: password}
 */
export const loginAccount = async (riakClient, myData) => {
    console.log('[loginAccount] Login request');

    return new Promise((resolve, reject) => {

        riakClient.fetchValue({
            bucket: 'USER',
            key: myData.username,
            convertToJs: true
        }, (error, result) => {
            if (error) {
                console.log('[loginAccount] Database fetch error');
                reject({ status: "error", error: error });
            } else {
                if (!result.isNotFound) {

                    var riakObject = result.values.shift();
                    var riakValue = riakObject.value;

                    (async function(){
                        const matchOrNot = await matchPassword(myData.password, riakValue.password)
                        .then((result2) => {
                            if(result2) {
                                console.log('[loginAccount] Same password');
                                resolve({ status: 'ok', message: 'Login successful' });
                            } else {
                                console.log('[loginAccount] Wrong password');
                                resolve({ status: 'not-ok', message: 'Wrong password' });
                            }
                        })
                        .catch(err => reject(err));
                    })();
                } else {
                    resolve({ status: 'not-ok', message: 'Account does not exist' });
                }
            }
        });
    });
}

/**
 * For backend/developer access only. Removed user's URL will still be retained.
 * @param {RiakClient} riakClient - RiakClient Object
 * @param {JSON} myData - JSON Object containing { String: username, String: deleteKey }
 */
export const deleteAccount = async (riakClient, myData) => {
    console.log('[deleteAccount] Delete account request');

    return new Promise((resolve, reject) => {
        if(myData.deleteKey == process.env.delete_key){
            genericDelete(riakClient, 'USER', myData.username)
                .then((result) => {
                    console.log('[deleteAccount] Key-value delete success');
                    resolve(result);
                })
                .catch((error) => {
                    console.log('[deleteAccount] Database delete error');
                    reject(error);
                });
        } else {
            reject({status: 'not-ok', message: 'Delete key is incorrect'})
        }
    });
}

